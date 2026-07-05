# bookplayer-align — The Prosodio Bookplayer - Alignment Visualisation

Status: planning/WIP

Goal: Visualize the epub/vtt alignment in the bookplayer UI

Work to be performed in @prosodio on new branch `bookplayer-align`

You may ask me questions if you need clarifications, or my intent os not clear
Please establih the feasibility of this plan, and feel free to propose an
alternative approach

## Plan Sketch

- [ ] Show alignment results
  - in the player view (player/$bookId view)
  - Add a panel showing an AlignmentViewer (new)
    - split the section showing the EpubReader view to be split horizontaly,
      50%-50%
    - | EpubReader| AlignmentViewer|
- The AlignmentViewer shows the list of [timecodes] cues - just like the
  Transcript section, but will highlight matches visually, with color/weight
  whatever is appropriate, match, mismatch-not-in-ebook
  - for mismatches where the is content in ebook not in the vtt, we could insert
    a visual cue (utf8 symbol perhaps)
- [ ] To Do this we need to transport some type holding the alignment data
  - currently is is produced in apps/align
    - we might have to define a new data structure appropriate for the browser
    - we need to produce. that alignment in bookplayer
      - That might imply refactoring current `apps/align` into `apps/align-cli`
        (renamed), `packages/align`(new)
    - This might require exposing some epub and vtt structure to the browser
      side as well

My Validation - after implementation  
Before we merge, I will make a full corpus revalidation (in their `reports/`
nested (ignored) git repo)

- in apps/epub-validate: `bun run validate;  (cd reports/; git status )`
- in apps/align: `bun run align.ts;  (cd reports/; git status )`
