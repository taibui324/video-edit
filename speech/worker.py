"""Local CPU transcription. Only --download may access the model repository."""
import argparse
import json
import os
import hashlib
from importlib.metadata import version
from pathlib import Path

MODEL = "Systran/faster-whisper-base"
REVISION = "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"

parser = argparse.ArgumentParser()
parser.add_argument("--model-dir", required=True)
parser.add_argument("--download", action="store_true")
parser.add_argument("--check", action="store_true")
parser.add_argument("--audio")
parser.add_argument("--language", default="auto")
args = parser.parse_args()

if args.download:
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL, revision=REVISION, local_dir=args.model_dir,
                      allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*"])
    print(json.dumps({"model": MODEL, "revision": REVISION, "directory": args.model_dir}))
else:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from faster_whisper import WhisperModel
    for name in ["config.json", "model.bin", "tokenizer.json"]:
        if not (Path(args.model_dir) / name).is_file():
            raise RuntimeError("Local model files are missing. Run pnpm speech:setup first.")
    if args.check:
        print(json.dumps({"ready": True}))
    else:
        if not args.audio:
            parser.error("--audio is required for transcription")
        model = WhisperModel(args.model_dir, device="cpu", compute_type="int8",
                             cpu_threads=min(os.cpu_count() or 2, 4), local_files_only=True)
        segments, info = model.transcribe(args.audio, language=None if args.language == "auto" else args.language,
                                          word_timestamps=True, beam_size=5, vad_filter=True,
                                          condition_on_previous_text=False)
        words = []
        for segment in segments:
            for word in segment.words or []:
                words.append({"text": word.word, "start": word.start, "end": word.end})
                if len(words) > 10000:
                    raise RuntimeError("The recording exceeds the 10,000-word transcription limit.")
        with open(Path(args.model_dir) / "model.bin", "rb") as weights:
            checksum = hashlib.file_digest(weights, "sha256").hexdigest()
        print(json.dumps({"words": words, "language": info.language,
                          "languageProbability": info.language_probability,
                          "provenance": {"runtime": "faster-whisper@" + version("faster-whisper"),
                                         "modelSha256": checksum}}))
