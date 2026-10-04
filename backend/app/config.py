"""Tunable constants. Only WORD_CAP and UPLOAD_CAP_BYTES read an env override."""

import os


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


# Beats
BEAT_TARGET = 800
BEAT_MIN = 500
BEAT_MAX = 1200
SHORT_WORK_WORDS = 8000
SHORT_BEAT_TARGET = 400
MIN_BEATS = 8
GROUP_FLOOR = 250  # a chapter/scene group below this merges into a neighbor
SCENE_MERGE_WORDS = 300  # screenplay: scenes shorter than this merge forward
TRANSCRIPT_TARGET_S = 180.0
TRANSCRIPT_MIN_S = 120.0
SILENCE_BREAK_S = 8.0
TAIL_MAX_WORDS = 120
NOVEL_MIN_WORDS = 20_000  # prose at least this long is scored as a novel, shorter as a story

# Caps
WORD_CAP = _int("WORD_CAP", 600_000)
UPLOAD_CAP_BYTES = _int("UPLOAD_CAP_BYTES", 50 * 1024 * 1024)
# A text format over this is past WORD_CAP in any real prose; refusing it early saves the parse.
TEXT_CAP_BYTES = 8 * WORD_CAP
ZIP_ENTRIES_MAX = 10_000
EPUB_SPINE_MAX = 5_000
STRIP_MAX_FRACTION = 0.15
CHAPTER_TITLE_MAX = 80

# Estimate
TOKENS_PER_WORD = 1.33
STATE_OVERHEAD = 1.15
QUESTION_TOKENS = 2800
DRIVER_CALLS = 40
DRIVER_TOKENS = 1500
USD_PER_MTOK = 0.042
RPS_PER_KEY = 20
JOB_CONCURRENCY = 8
LATENCY_S = 0.25
FIXED_OVERHEAD_S = 10

# Language gate
LANGUAGE_SAMPLE_WORDS = 2000
ENGLISH_MIN_RATIO = 0.15

# Curves
BINS = 100
SHAPE_MIN_SD = 0.1
WHITTAKER_SHAPE = 200.0
WHITTAKER_DETAIL = 10.0
WEIGHT_EPS = 0.05
SHAPE_NAMED_R = 0.55
SHAPE_LEANS_R = 0.40
SHAPE_MARGIN = 0.10
# Fitted per type on the dev split: the best F1 with precision at least 0.8.
EVENT_STRONG = {
    "reveal": 0.80,
    "death": 0.55,
    "arrival_departure": 0.55,
    "location_change": 0.50,
    "confrontation": 0.65,
    "reconciliation": 0.70,
    "decision": 0.80,
    "betrayal": 0.50,
    "injury_violence": 0.55,
}
EVENT_FAINT = {
    "reveal": 0.65,
    "death": 0.40,
    "arrival_departure": 0.40,
    "location_change": 0.40,
    "confrontation": 0.40,
    "reconciliation": 0.50,
    "decision": 0.75,
    "betrayal": 0.40,
    "injury_violence": 0.40,
}
EVENT_MIN_BIN_GAP = 2
MODE_MIXED_CONFIDENCE = 0.6
PEAKS_PER_AXIS = 4

# Server
RUNNING_JOBS_MAX = 4
QUEUED_MAX = 4  # works waiting behind the running ones before new uploads are refused
SESSION_RUNNING_MAX = 2
SESSION_ANALYSES_PER_DAY = 20
IP_UPLOADS_PER_DAY = 30
# A shared NAT stays well under it; a script filling the sessions table does not.
IP_SESSIONS_PER_DAY = 200
KEPT_PER_SESSION = 50
KEY_CHECKS_PER_HOUR = 5
HEARTBEAT_S = 5
LEASE_S = 60
WORKER_IDLE_POLL_S = 600
SWEEP_INTERVAL_S = 600
EXPIRE_AFTER_S = 3600
TEXT_MAX_AGE_H = 24
SESSION_MAX_IDLE_DAYS = 180
