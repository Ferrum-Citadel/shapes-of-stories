import math
from dataclasses import dataclass

from app import config
from app.core.errors import IngestError


@dataclass
class Estimate:
    words: int
    beats: int
    requests: int
    tokens: int
    cost_usd: float
    seconds: int


def estimate(words: int, beats: int) -> Estimate:
    requests = beats + config.DRIVER_CALLS
    tokens = int(
        words * config.TOKENS_PER_WORD * config.STATE_OVERHEAD
        + beats * config.QUESTION_TOKENS
        + config.DRIVER_CALLS * config.DRIVER_TOKENS
    )
    cost = math.ceil(tokens * config.USD_PER_MTOK / 1e6 * 100) / 100
    latency = requests / config.JOB_CONCURRENCY * config.LATENCY_S
    seconds = math.ceil(max(requests / config.RPS_PER_KEY, latency) + config.FIXED_OVERHEAD_S)
    return Estimate(words, beats, requests, tokens, cost, seconds)


def check_caps(words: int, upload_bytes: int) -> None:
    if upload_bytes > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=upload_bytes, cap=config.UPLOAD_CAP_BYTES)
    if words > config.WORD_CAP:
        raise IngestError("over_word_cap", words=words, cap=config.WORD_CAP)
