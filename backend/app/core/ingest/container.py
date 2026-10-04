import io
import zipfile

from app import config
from app.core.errors import IngestError


def check_zip(data: bytes) -> None:
    """Reject an archive with too many entries, or whose declared entry sizes (individually
    or summed) exceed the upload cap, before any entry is inflated."""
    z = zipfile.ZipFile(io.BytesIO(data))
    if len(z.filelist) > config.ZIP_ENTRIES_MAX:
        raise IngestError("over_upload_cap", entries=len(z.filelist), cap=config.ZIP_ENTRIES_MAX)
    total = 0
    for info in z.infolist():
        if info.file_size > config.UPLOAD_CAP_BYTES:
            raise IngestError("over_upload_cap", bytes=info.file_size, cap=config.UPLOAD_CAP_BYTES)
        total += info.file_size
    if total > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=total, cap=config.UPLOAD_CAP_BYTES)


def read_capped(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=info.file_size, cap=config.UPLOAD_CAP_BYTES)
    with z.open(name) as f:
        data = f.read(config.UPLOAD_CAP_BYTES + 1)
    if len(data) > config.UPLOAD_CAP_BYTES:
        raise IngestError("over_upload_cap", bytes=len(data), cap=config.UPLOAD_CAP_BYTES)
    return data
