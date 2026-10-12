# HamburgRiders — what is this?

**In one sentence:** HamburgRiders is a *demo animation* that shows how Hamburg's buses and trains are *supposed* to
drive on one day, according to the official timetable. It is **not** a live map.

## The idea, step by step

1. **Every transport company publishes its timetable as a data package called GTFS.**
   GTFS ("General Transit Feed Specification") is just a set of tables: which lines exist, which stops they use, and
   at what time each trip passes each stop. Google Maps and many apps use the same format.
2. **Hamburg's transport association (HVV) publishes its GTFS package** on the city's open-data portal.
3. **We took the timetable of one single day (31 May 2026, a Sunday)** and shrank it into a few small files
   (`public/hamburgriders/data/`). Nothing is downloaded from HVV while you use the map.
4. **The map then "plays" that day.** A dot is placed on the map for every trip that is under way at the chosen time.
   Between two stops the dot simply moves in a straight line, so it does not follow the real track or street.

## What you see

| On the map | What it means |
| --- | --- |
| Glowing colored areas | Many stops close together (green = S-Bahn, red = U-Bahn, orange = regional trains, blue = buses). |
| Small circles when you zoom in | The stops themselves. |
| Moving dots | Trips that are driving at the selected time, in the color of their line. |
| Timeline at the bottom | Play/pause, drag to a time of day (05:00 to 05:00 the next morning), speed of the animation. |
| Panel on the right | Statistics and a list of lines. Tick or untick a line to show or hide its vehicles. |

## Please remember: this is sample data

- **It is a sample for demonstration and research only.** It is not a travel planner.
- **It shows the plan, not reality.** There are no delays, cancellations or construction work. A real train may be
  somewhere else.
- **It is one day only.** Another weekday or a holiday has a different timetable.
- **The numbers follow your selection.** "Active trips" counts only the lines you currently show. (The original
  HamburgRiders counted every trip.)
- The data is a pre-built extract; it will not update on its own.

## Where does it come from?

- **Timetable data:** HVV GTFS feed from the Hamburg transparency portal (publisher, version and validity dates are
  shown in the panel under "About this data"). Please check the portal's licence terms before re-using the data
  outside this project; they were not re-verified when this module was added.
- **Original application:** [hamburgriders](https://github.com/bertt/utrechtriders) lineage (MIT), forked from
  *utrechtriders* and inspired by *londonriders*. Details and license text: `NOTICE.md`, `LICENSE-hamburgriders.txt`.
- **Dark background map:** CARTO Dark Matter, © CARTO, © OpenStreetMap contributors.

## For developers (short)

- Everything lives in this folder, `src/store/hamburgRiders.ts`, `src/components/HamburgRiders/` and one worker
  (`src/core/workers/hamburgRidersData.worker.ts`). TOSCA's own map code is not changed.
- **Other stories can use it** through `ridersApi.ts`:

  ```ts
  activateHamburgRiders({ consumer: "my-story", modes: ["u-bahn"] }); // network + stops + U-Bahn vehicles
  showRoute("U3", { consumer: "my-story" });
  setRidersTime("08:30");
  deactivateHamburgRiders("my-story"); // removes only what "my-story" asked for
  ```

  Each caller is a *consumer*; the map shows what all consumers together ask for, so one story closing never
  removes another story's layers.
- The standalone story is registered as `hamburg-riders` in `src/config/urbanStories/`.
- Tests: `*.test.ts` next to the code and `src/store/hamburgRiders.test.ts`.
