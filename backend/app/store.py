"""Database access. Functions take an open connection (autocommit) and use explicit transactions
where needed."""

from collections.abc import Sequence
from dataclasses import asdict

from psycopg.types.json import Jsonb

from app import config
from app.core.jev.questions import QUESTION_SET_VERSION
from app.core.prepare import Prepared
from app.security import new_token


async def create_session(conn) -> str:
    sid = new_token()
    await conn.execute("insert into sessions(id) values (%s)", (sid,))
    return sid


async def touch_session(conn, sid: str) -> bool:
    cur = await conn.execute(
        "update sessions set last_seen_at=now() where id=%s returning id", (sid,)
    )
    return await cur.fetchone() is not None


async def lock_session(conn, sid: str):
    # Held until the caller's transaction ends, so a session's uploads count and insert in turn.
    await conn.execute("select 1 from sessions where id=%s for update", (sid,))


async def create_work(
    conn, *, session_id, prepared: Prepared, text_ct, text_nonce, key_ct, key_nonce, kind
) -> str:
    wid = new_token()
    s = prepared.structure
    p = prepared.parsed
    async with conn.transaction():
        await conn.execute(
            """insert into works(id, session_id, title, author, kind, format, word_count,
                                 chapter_count, beat_count, question_set_version, state,
                                 structure)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'queued',%s)""",
            (
                wid,
                session_id,
                p.title,
                p.author,
                kind,
                p.format,
                s.word_count,
                len(s.chapters),
                len(s.beats),
                QUESTION_SET_VERSION,
                Jsonb(asdict(s)),
            ),
        )
        async with conn.cursor() as cur:
            await cur.executemany(
                """insert into beats(work_id, idx, chapter_idx, start_cp, end_cp, start_s,
                                     end_s, word_count, cache_key)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,'')""",
                [
                    (
                        wid,
                        b.idx,
                        b.chapter_idx,
                        b.start_cp,
                        b.end_cp,
                        b.start_s,
                        b.end_s,
                        b.word_count,
                    )
                    for b in s.beats
                ],
            )
        await conn.execute(
            """insert into jobs(work_id, total, text_ciphertext, nonce, key_ciphertext,
                                key_nonce)
               values (%s,%s,%s,%s,%s,%s)""",
            (wid, len(s.beats), text_ct, text_nonce, key_ct, key_nonce),
        )
    return wid


# An expired work reads as gone before the sweeper deletes it.
LIVE = "(expires_at is null or expires_at > now())"


async def get_work(conn, work_id: str):
    cur = await conn.execute(f"select * from works where id=%s and {LIVE}", (work_id,))
    return await cur.fetchone()


async def get_job(conn, work_id: str):
    cur = await conn.execute("select * from jobs where work_id=%s", (work_id,))
    return await cur.fetchone()


async def list_works(conn, session_id: str) -> list[dict]:
    cur = await conn.execute(
        f"""select id, title, author, kind, state, kept, word_count, created_at, completed_at,
                  expires_at, analysis->'archetype'->>'caption' as caption
           from works where session_id=%s and {LIVE} order by created_at desc""",
        (session_id,),
    )
    return await cur.fetchall()


async def beats_done(conn, work_id: str) -> dict[int, dict]:
    cur = await conn.execute(
        "select idx, answers from beats where work_id=%s and answers is not null order by idx",
        (work_id,),
    )
    return {r["idx"]: r["answers"] for r in await cur.fetchall()}


def watermark(done) -> int:
    """Highest k such that beats 0..k are all done; -1 if beat 0 isn't done yet. `done` is
    any container supporting `in` (a beats_done() dict or a set of indexes)."""
    wm = -1
    while wm + 1 in done:
        wm += 1
    return wm


async def set_state(conn, work_id: str, state: str, error: str | None = None):
    await conn.execute(
        "update works set state=%s, error=coalesce(%s, error) where id=%s",
        (state, error, work_id),
    )


async def set_kind_warning(conn, work_id: str, warning: str | None):
    await conn.execute("update works set kind_warning=%s where id=%s", (warning, work_id))


async def touch_viewed(conn, work_id: str):
    await conn.execute("update works set last_viewed_at=now() where id=%s", (work_id,))


async def save_beat(conn, work_id: str, idx: int, answers: dict, model_id: str | None) -> int:
    async with conn.transaction():
        # Taking the job row first makes a save that waits re-count with a fresh snapshot.
        await conn.execute("select 1 from jobs where work_id=%s for update", (work_id,))
        await conn.execute(
            "update beats set answers=%s, model_id=%s, missing=%s where work_id=%s and idx=%s",
            (Jsonb(answers), model_id, bool(answers.get("missing")), work_id, idx),
        )
        cur = await conn.execute(
            """update jobs set done=(select count(*) from beats
                                      where work_id=%s and answers is not null),
                      updated_at=now()
               where work_id=%s returning done""",
            (work_id, work_id),
        )
        return (await cur.fetchone())["done"]


async def clear_job_secrets(conn, where: str, params: tuple, *, keep_text: bool = False):
    # The one statement that deletes a reader's key, and their text unless a resume needs it.
    text = "" if keep_text else "text_ciphertext=null, nonce=null, "
    sql = f"update jobs set {text}key_ciphertext=null, key_nonce=null, updated_at=now() where "
    return await conn.execute(sql + where, params)


async def complete_work(conn, work_id: str, analysis: dict, model_id: str | None) -> bool:
    async with conn.transaction():
        cur = await conn.execute(
            """update works set analysis=%s, model_id=%s, state='complete', error=null,
                      completed_at=now(),
                      expires_at = case when kept then null else now() + %s * interval '1 second'
                                   end
               where id=%s and state in ('running','paused') returning id""",
            (Jsonb(analysis), model_id, config.EXPIRE_AFTER_S, work_id),
        )
        changed = await cur.fetchone() is not None
        if changed:
            await clear_job_secrets(conn, "work_id=%s", (work_id,))
        return changed


async def fail_work(conn, work_id: str, error: str, keep_text: bool) -> bool:
    async with conn.transaction():
        cur = await conn.execute(
            """update works set state='failed', error=%s, completed_at=now(),
                      expires_at = case when kept then null else now() + %s * interval '1 second'
                                   end
               where id=%s and state in ('running','paused') returning id""",
            (error, config.EXPIRE_AFTER_S, work_id),
        )
        changed = await cur.fetchone() is not None
        if changed:
            await clear_job_secrets(conn, "work_id=%s", (work_id,), keep_text=keep_text)
        return changed


async def cancel_work(conn, work_id: str) -> bool:
    async with conn.transaction():
        cur = await conn.execute(
            """update works set state='cancelled', completed_at=now(),
                      expires_at = case when kept then null else now() + %s * interval '1 second'
                                   end
               where id=%s and state in ('queued','running','paused') returning id""",
            (config.EXPIRE_AFTER_S, work_id),
        )
        changed = await cur.fetchone() is not None
        if changed:
            await clear_job_secrets(conn, "work_id=%s", (work_id,))
        return changed


async def set_kept(conn, work_id: str, max_kept: int) -> bool:
    cur = await conn.execute(
        """update works set kept=true, expires_at=null where id=%s and (
               select count(*) from works w2
               where w2.session_id=works.session_id and w2.kept and w2.id<>works.id
           ) < %s
           returning id""",
        (work_id, max_kept),
    )
    return await cur.fetchone() is not None


async def delete_work(conn, work_id: str):
    await conn.execute("delete from works where id=%s", (work_id,))


async def count_running(conn, session_id: str | None = None) -> int:
    if session_id:
        cur = await conn.execute(
            """select count(*) as n from works
               where state in ('queued','running','paused') and session_id=%s""",
            (session_id,),
        )
    else:
        cur = await conn.execute(
            "select count(*) as n from works where state in ('queued','running','paused')"
        )
    return (await cur.fetchone())["n"]


async def queue_position(conn, work_id: str) -> int | None:
    cur = await conn.execute(
        """select case when w.state='queued' then 1 + (
                     select count(*) from works w2
                     where w2.state='queued' and w2.created_at < w.created_at
                   ) end as pos
           from works w where w.id=%s""",
        (work_id,),
    )
    row = await cur.fetchone()
    return row["pos"] if row else None


async def claim_job(conn, worker_id: str, exclude: Sequence[str] = ()):
    async with conn.transaction():
        cur = await conn.execute(
            """select j.work_id from jobs j join works w on w.id=j.work_id
               where ((w.state='queued')
                  or (w.state in ('running','paused')
                      and j.heartbeat_at < now() - %s * interval '1 second'))
                 and j.work_id <> all(%s::text[])
               order by j.created_at limit 1 for update of j skip locked""",
            (config.LEASE_S, list(exclude)),
        )
        row = await cur.fetchone()
        if not row:
            return None
        wid = row["work_id"]
        await conn.execute(
            """update jobs set claimed_by=%s, heartbeat_at=now(), attempts=attempts+1,
                      updated_at=now()
               where work_id=%s""",
            (worker_id, wid),
        )
        await conn.execute("update works set state='running' where id=%s", (wid,))
        cur = await conn.execute(
            """select j.*, w.structure, w.format, w.word_count, w.kept, w.question_set_version,
                      w.error
               from jobs j join works w on w.id=j.work_id where j.work_id=%s""",
            (wid,),
        )
        return await cur.fetchone()


async def restart_scoring(conn, work_id: str):
    """Drops every stored answer and any earlier failure, and stamps the current question set,
    the one the scoring that follows uses."""
    async with conn.transaction():
        await conn.execute("update jobs set done=0 where work_id=%s", (work_id,))
        await conn.execute(
            "update beats set answers=null, model_id=null, missing=false where work_id=%s",
            (work_id,),
        )
        await conn.execute(
            "update works set question_set_version=%s, kind_warning=null, error=null where id=%s",
            (QUESTION_SET_VERSION, work_id),
        )


async def heartbeat(conn, work_id: str):
    await conn.execute("update jobs set heartbeat_at=now() where work_id=%s", (work_id,))


async def requeue_work(conn, work_id: str, key_ct: bytes, key_nonce: bytes):
    async with conn.transaction():
        await conn.execute(
            """update jobs set key_ciphertext=%s, key_nonce=%s, heartbeat_at=null,
                      claimed_by=null, updated_at=now()
               where work_id=%s""",
            (key_ct, key_nonce, work_id),
        )
        # The last failure stays until the work completes: a work that failed with passages still
        # unscored completes with the gap on its next run.
        await conn.execute(
            """update works set state='queued', expires_at=null, completed_at=null
               where id=%s""",
            (work_id,),
        )


async def create_share(conn, work_id: str) -> str:
    tok = new_token()
    await conn.execute("insert into share_links(token, work_id) values (%s,%s)", (tok, work_id))
    return tok


async def active_share(conn, work_id: str) -> str | None:
    cur = await conn.execute(
        """select token from share_links where work_id=%s and revoked_at is null
           order by created_at desc limit 1""",
        (work_id,),
    )
    row = await cur.fetchone()
    return row["token"] if row else None


async def share_once(conn, work_id: str) -> str | None:
    """The live token of a kept work, made on the first call; None for a work not kept."""
    # The work's row is locked, so two shares at once agree on one live token.
    async with conn.transaction():
        cur = await conn.execute("select kept from works where id=%s for update", (work_id,))
        row = await cur.fetchone()
        if not row or not row["kept"]:
            return None
        return await active_share(conn, work_id) or await create_share(conn, work_id)


async def revoke_share(conn, work_id: str):
    # The same lock as share_once, so a stop and a share never interleave.
    async with conn.transaction():
        await conn.execute("select 1 from works where id=%s for update", (work_id,))
        await conn.execute(
            "update share_links set revoked_at=now() where work_id=%s and revoked_at is null",
            (work_id,),
        )


async def get_shared(conn, token: str):
    cur = await conn.execute(
        """select w.* from share_links s join works w on w.id=s.work_id
           where s.token=%s and s.revoked_at is null and w.kept""",
        (token,),
    )
    return await cur.fetchone()


async def bump_limit(conn, bucket: str) -> int:
    cur = await conn.execute(
        """insert into rate_limits(bucket, count) values (%s, 1)
           on conflict (bucket) do update set count=rate_limits.count+1
           returning count""",
        (bucket,),
    )
    return (await cur.fetchone())["count"]
