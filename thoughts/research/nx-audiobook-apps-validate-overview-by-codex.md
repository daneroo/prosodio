# `apps/validate` validation overview

The normal run has **one meaningful global validation** and **five per-directory
validation results**. Per-directory checks run for the root directory and every
descendant directory, including organizational directories with no audio files.

## Validation inventory

| Validation                                              | Scope                                 | What it checks                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `validateFilesAllAccountedFor`                          | Global                                | Recursively checks every file beneath `rootPath` against known extensions and filenames.                                         |
| `validateFilesAllAccountedFor`                          | Per-directory                         | Receives only already-recognized audio files, so it effectively always passes.                                                   |
| `validateUniqueAuthorTitle` / `validateAuthorTitleHint` | Per-directory                         | Intended to require a non-empty, consistent author and title. Actual behavior is mostly “first audio file has author and album.” |
| `validateDuration`                                      | Per-directory                         | Requires every audio file’s duration and the aggregate duration to be positive.                                                  |
| `validateCover`                                         | Per-directory                         | Checks external/embedded cover availability, filename, and metadata parsing warnings.                                            |
| `validateModTimeHint` / `validateModTimeHintBook`       | Per-directory                         | Checks audio-file and directory modification times against the hard-coded acquisition-time database.                             |
| `fixModTimeHintBook`                                    | Special `--mtime` mode, per-directory | Checks or fixes modification times; this mode replaces the normal validation run.                                                |

The orchestration is in
[`apps/validate/src/index.ts`](apps/validate/src/index.ts), and the normal
per-directory list is assembled in
[`apps/validate/src/app/validate/validateDirectory.ts`](apps/validate/src/app/validate/validateDirectory.ts).

## Global validation

### All files accounted for

The global pass recursively collects every file beneath the root and calls
`validateFilesAllAccountedFor`.

Recognized files are:

- Audio extensions: `.mp3`, `.m4b`, `.m4a`
- Ebook extensions: `.pdf`, `.epub`
- Allowed exact filenames: `cover.jpg`, `cover.png`, `metadata.json`
- Ignored extension: `.tiff`
- Ignored exact filenames: `.DS_Store`, `MD5SUM`

Anything else becomes an `unaccounted` warning. Matching is case-sensitive, so
`.MP3`, `Cover.jpg`, `cover.jpeg`, and arbitrary `.jpg` files are unaccounted.
See
[`packages/validators/src/validators.ts`](packages/validators/src/validators.ts).

This is the only validation that genuinely examines the collection as a whole.
It does not enforce directory structure, one book per directory, or global
uniqueness of author/title.

## Per-directory validations

Each directory is classified non-recursively: only its immediate recognized
audio files are loaded and parsed. The first image with a case-insensitive
`jpg`, `jpeg`, or `png` extension becomes its `coverFile`. See
[`apps/validate/src/app/validate/classifyDirectory.ts`](apps/validate/src/app/validate/classifyDirectory.ts).

### 1. All files accounted for

Although this is included per directory, it receives:

```ts
audioFiles.map((file) => file.fileInfo);
```

Non-audio files were already removed during classification. Every supplied file
has therefore already passed `isAudioFile`, making this validation effectively
guaranteed to pass. It reports only the recognized audio count and cannot find
an unexpected file in that directory.

The global version is the operative one.

### 2. Author/title

The intended validation is “all audio files have one non-empty author and one
non-empty title,” but the implementation behaves differently:

1. Directory-level author and title are copied from the **first audio file**.
2. If those two values are non-empty, it immediately succeeds as
   `validateAuthorTitleHint`.
3. It does not compare the remaining audio files in that case.
4. The uniqueness comparison only runs if the first file is missing author or
   title. Because the first file’s empty value is included in that comparison,
   the fallback cannot produce a valid non-empty result for that field.

Consequently, the effective rule is:

> A directory with audio passes when the first recognized audio file has a
> non-empty artist and album tag.

Despite its name, it does not currently ensure consistency across multiple
files. Also, `title` comes from the metadata **album** field, not the track
title. See
[`apps/validate/src/app/validate/validateDirectory.ts`](apps/validate/src/app/validate/validateDirectory.ts)
and
[`apps/validate/src/app/validate/classifyDirectory.ts`](apps/validate/src/app/validate/classifyDirectory.ts).

Directories without audio skip successfully.

### 3. Duration

This passes when:

- The directory has no audio files; or
- Every audio file has `duration > 0`; and
- The rounded sum of all durations is greater than zero.

Metadata parsing first attempts `music-metadata`; unusable durations fall back
to `ffprobe`. A successful fallback adds `"overridden with ffprobe"` to the
reported extras, but that warning does **not** make the validation fail.

If metadata extraction or the `ffprobe` fallback throws, that is not converted
into a validation result—the overall command aborts.

### 4. Cover

For a directory containing audio, it considers two possible cover sources:

- `coverFile`: the first immediate `.jpg`, `.jpeg`, or `.png` file found
- `metadata.cover`: the embedded cover derived primarily from the first audio
  file

It additionally gathers cover-format warnings from every audio file.

Important behavior:

- No external image adds `"no cover file found"` even if an embedded cover
  exists.
- Any warning makes the final validation fail.
- Therefore, an embedded-only cover still fails.
- The external filename must be exactly `cover.jpg` or `cover.png`.
- `cover.jpeg`, uppercase variants, and arbitrary image names fail the filename
  check.
- Because classification selects the first image rather than specifically
  locating `cover.jpg`/`cover.png`, an unrelated image encountered first can
  cause failure even if a valid cover is also present.
- There is a severity inconsistency: if some cover exists but warnings cause
  failure, the result can be `ok: false` while its `level` remains `info`.

The relevant logic is in
[`apps/validate/src/app/validate/validateDirectory.ts`](apps/validate/src/app/validate/validateDirectory.ts).

### 5. Modification-time hint

This derives an `Author - Title` lookup key and looks it up in the hard-coded
`modTimeDB`.

It fails when:

- The author/title key cannot be constructed.
- The key is absent from the database.
- Any recognized audio file’s modification time differs from the expected
  timestamp.
- The directory’s own modification time differs from the expected timestamp.

Despite comments referring only to audio files, the directory itself is
explicitly included. Non-audio files are not checked during the normal
validation.

Comparison is exact to the millisecond. Depending on the path taken, the
displayed validation name is either `validateModTimeHint` or
`validateModTimeHintBook`. See
[`apps/validate/src/app/validate/validateModTime.ts`](apps/validate/src/app/validate/validateModTime.ts).

Directories without audio skip successfully.

## Special `--mtime` behavior

Using `--mtime check` or `--mtime fix` exits the normal flow early:

- No global accounted-files validation runs.
- None of the other per-directory validations run.
- Only directories containing audio are processed.
- `check` performs the modification-time comparison.
- `fix` updates recognized audio files and the directory itself.
- A fix invocation still reports the files it changed as mismatches because
  `fixModTimeFile` returns `false` after changing them. A subsequent check
  should pass.

## Operational notes

- Validation failures only affect displayed output; they do not set a failing
  process exit code.
- `warn`, `error`, and `info` choose the console output method, but `show()`
  determines overall success solely from `ok`.
- At default verbosity, successful directories are hidden. `-v` shows every
  directory title but only failed checks; `-vv` shows all checks.
- The app does not currently validate directory naming, nesting conventions,
  audiobook count per directory, audio ordering, codecs/bitrates, global
  metadata uniqueness, or agreement between filenames and embedded metadata.
