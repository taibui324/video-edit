"""Local Kokoro synthesis; only the explicit download command needs a network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from importlib.metadata import version
import urllib.request
import wave

parser = argparse.ArgumentParser()
parser.add_argument("--model-dir", required=True)
parser.add_argument("--download", action="store_true")
parser.add_argument("--check", action="store_true")
parser.add_argument("--input")
parser.add_argument("--output")
args = parser.parse_args()
folder = Path(args.model_dir)
files = {"kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
         "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"}
def checksum(path):
    with open(path, "rb") as artifact:
        return hashlib.file_digest(artifact, "sha256").hexdigest()
voices = [{"id": "af_heart", "name": "Heart", "language": "en-us"},
          {"id": "af_bella", "name": "Bella", "language": "en-us"},
          {"id": "am_michael", "name": "Michael", "language": "en-us"}]

if args.download:
    folder.mkdir(parents=True, exist_ok=True)
    for name in files:
        target = folder / name
        if not target.is_file():
            pending = folder / (name + ".part")
            try:
                urllib.request.urlretrieve("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/" + name, pending)
                if checksum(pending) != files[name]:
                    raise RuntimeError("Downloaded voice artifact checksum mismatch: " + name)
                pending.replace(target)
            finally:
                pending.unlink(missing_ok=True)
        if checksum(target) != files[name]:
            raise RuntimeError("Existing voice artifact checksum mismatch: " + name)
    print(json.dumps({"downloaded": files, "release": "model-files-v1.1"}))
else:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from kokoro_onnx import Kokoro
    import numpy as np
    import onnxruntime as ort
    for name in files:
        if not (folder / name).is_file():
            raise RuntimeError("Local voice model is missing. Run pnpm voice:setup first.")
        if checksum(folder / name) != files[name]:
            raise RuntimeError("Local voice artifact checksum mismatch: " + name)
    if args.check:
        print(json.dumps({"voices": voices}))
    else:
        if not args.input or not args.output:
            parser.error("--input and --output are required")
        request = json.loads(Path(args.input).read_text())
        if request["voice"] not in [v["id"] for v in voices]:
            raise RuntimeError("Unsupported voice.")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session = ort.InferenceSession(str(folder / "kokoro-v1.0.onnx"), sess_options=options,
                                       providers=["CPUExecutionProvider"])
        kokoro = Kokoro.from_session(session, str(folder / "voices-v1.0.bin"))
        samples, rate = kokoro.create(request["text"], voice=request["voice"], speed=request["speed"], lang="en-us")
        if not np.isfinite(samples).all() or not len(samples):
            raise RuntimeError("The voice model returned empty or invalid audio.")
        with wave.open(args.output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(json.dumps({"runtime": "kokoro-onnx@" + version("kokoro-onnx"),
                          "checksums": files, "sampleRate": rate}))
