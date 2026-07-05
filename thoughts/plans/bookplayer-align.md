# bookplayer-align — The Prosodio Bookplayer - Alignment Visualisation

Status: planning/WIP

Goal: Visualize the pub/vtt alignment in the bookplayer UI

Work to be performed in @prosodio on new branch `bookplayer-align-ui`

## Plan Sketch

- [ ] Show alignment results
  - in the player view (player/$bookId view)
  - Add a panel showing an AlignmentViewer (new)
    - split the section showing the EpubReader view to be split horizontaly,
      50%-50%
    - | EpubReader| AlignemtnViwer|
- [ ] To Do this we need to transport some type holding the alignemnt data
  - currently is is produced in apps/align
    - we might have to defeine a new data structure appropriate for the browser
    - we need to produce. that alignemnt in bookplayer
      - That might imply refactroing current `apps/align` into `apps/align-cli`
        (renamed), `packages/align`(new)
    - This might require exposing some epub and vtt structure to the browser
      side as well

My Validation - after implementation  
Before we merge, I will make a full corpus revalidation (in their `reports/`
nested (ignored) git repo)

- in apps/epub-validate: `bun run validate;  (cd reports/; git status )`
- in apps/align: `bun run align.ts;  (cd reports/; git status )`
