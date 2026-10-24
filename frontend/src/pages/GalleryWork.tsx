import { useEffect, useState } from "react";
import { useParams } from "react-router";
import WorkViewer from "../components/WorkViewer";
import type { Room } from "../components/RoomLinks";
import type { GalleryEntry, GalleryWork as GW } from "../types";
import { metaOf } from "../lib/definitions";
import PageNotice from "../components/PageNotice";
import { INDEX, forgetFile, galleryFile, isSlug, keptFile, neighbors } from "../lib/gallery";
import { useLeaveMark } from "../lib/motion";
import { boxButton, quiet } from "../lib/ui";
import PosterButton from "../poster/Poster";
import { ActionIcon } from "../components/icons";

export default function GalleryWork() {
  const { slug = "" } = useParams();
  useLeaveMark(`/gallery/${slug}`);
  // Files already fetched, as on a move from the wall, draw the page on its first frame, so its title can travel.
  const [w, setW] = useState<GW | null>(() => keptFile<GW>(`/gallery/${slug}.json`) ?? null);
  const [err, setErr] = useState(() => !isSlug(slug));
  const [room, setRoom] = useState<Room | undefined>(() => {
    const es = keptFile<GalleryEntry[]>(INDEX);
    return es && neighbors(es, slug);
  });
  useEffect(() => {
    if (!isSlug(slug)) return;
    galleryFile<GW>(`/gallery/${slug}.json`)
      .then(setW)
      .catch(() => {
        forgetFile(`/gallery/${slug}.json`);
        setErr(true);
      });
    // Without the index the page simply has no room row.
    galleryFile<GalleryEntry[]>(INDEX)
      .then((es) => setRoom(neighbors(es, slug)))
      .catch(() => {
        forgetFile(INDEX);
        setRoom(undefined);
      });
  }, [slug]);
  if (err)
    return (
      <PageNotice title="Not in the gallery" alert>
        No book by that name hangs on the wall.
      </PageNotice>
    );
  if (!w)
    return (
      <p role="status" className={quiet}>
        Loading the work…
      </p>
    );
  return (
    <div className="space-y-4">
      <WorkViewer
        title={w.work.title}
        author={w.work.author}
        meta={metaOf({ ...w.work, structure: w.structure })}
        questionSet={w.work.question_set_version}
        analysis={w.analysis}
        structure={w.structure}
        textUrl={`/gallery/${slug}.txt`}
        answersUrl={`/gallery/answers/${slug}.json`}
        seenKey={`sos.seen.gallery.${slug}`}
        compareTo={`/compare?a=gallery:${slug}`}
        room={room}
        metaActions={(axes) => (
          <PosterButton
            className={`${boxButton} inline-flex items-center gap-1.5`}
            title={w.work.title}
            subtitle={w.work.author}
            analysis={w.analysis}
            axes={axes}
          >
            <ActionIcon name="image" />
          </PosterButton>
        )}
      />
      <p className="text-[14px] text-[var(--muted)]">
        Text from Project Gutenberg, public domain in the United States.
      </p>
    </div>
  );
}
