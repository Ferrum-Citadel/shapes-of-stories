# Credits

## Texts

Every gallery work is a public-domain text from [Project Gutenberg](https://www.gutenberg.org/), including the public-domain translations of the non-English works, such as Constance Garnett's. The texts in `frontend/public/gallery/` are redistributed without the Project Gutenberg header, footer and license, which the [Project Gutenberg permissions](https://www.gutenberg.org/policy/permission.html) allow for public-domain works that no longer carry its name.

## Labels

The calibration labels in `fixtures/calibration/`, and the expected shapes in `gallery/list.toml` and `gallery/validation.toml` that are written from a plot, were made by Claude Fable 5.1, Anthropic's language model, except the two readings of the whole pace and wonder passages, made by Claude Opus 5.5; no person checked them row by row. The other expected shapes come from the published arcs of Reagan et al. (2016), listed under Research.

## Fonts

The Fraunces typeface, copyright The Fraunces Project Authors, is used under the SIL Open Font License 1.1; the license is in `frontend/public/fonts/OFL.txt`.

## Icons

Event and action glyphs are from [Lucide](https://lucide.dev); its notice follows, and the link and download glyphs are among those it derives from Feather:

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Software

Scoring is done by [TypeSafe](https://docs.typesafe.ai/)'s Jev model through its API. The backend runs on FastAPI, Postgres, NumPy and SciPy; the frontend on React, Vite, Tailwind CSS and d3-shape. The full list is in `backend/uv.lock` and `frontend/package-lock.json`. Uploads are read according to the [Fountain](https://fountain.io/) screenplay syntax, [WebVTT](https://www.w3.org/TR/webvtt1/) for subtitles and [EPUB 3.3](https://www.w3.org/TR/epub-33/) for e-books.

## Research

The shapes and the method draw on this work:

| Work                                                                                                                                                                        | What it gives                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Kurt Vonnegut, _Palm Sunday_ (1981) and the "Shape of Stories" lecture                                                                                                      | the fortune axis, the idea of story shapes, and "Which Way Is Up?"   |
| Reagan, Mitchell, Kiley, Danforth and Dodds, [The emotional arcs of stories are dominated by six basic shapes](https://arxiv.org/abs/1606.07772), _EPJ Data Science_ (2016) | the six arcs, the core-stories data behind them, and the hedonometer |
| Matthew Jockers, [the Syuzhet package](https://cran.r-project.org/web/packages/syuzhet/vignettes/syuzhet-vignette.html)                                                     | percentage bins, DCT smoothing and the evidence on segment sizes     |
| Annie Swafford, [Problems with the Syuzhet package](https://annieswafford.wordpress.com/2015/03/02/syuzhet/) (2015), and Ben Schmidt's overview                             | the ringing and periodicity critiques                                |
| Boyd, Blackburn and Pennebaker, [The narrative arc](https://www.science.org/doi/10.1126/sciadv.aba2196), _Science Advances_ (2020)                                          | narrative arc segments and standardizing within a text               |
| Toubia, Berger and Eliashberg, [How quantifying the shape of stories predicts their success](https://www.pnas.org/doi/10.1073/pnas.2011695118), _PNAS_ (2021)               | 250-word windows and story speed                                     |
| Del Vecchio, Kharlamov, Parry and Pogrebna, [The data science of Hollywood](https://arxiv.org/abs/1807.02221) (2018)                                                        | arcs measured on films                                               |
| David Wilmot and Frank Keller, [Modelling suspense in short stories](https://aclanthology.org/2020.acl-main.161/) (2020)                                                    | suspense framed as dramatic tension                                  |
| Pablo Delatorre and colleagues                                                                                                                                              | suspense                                                             |
| Saif Mohammad and Peter Turney, the [NRC Emotion Lexicon](https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm)                                                        | words tied to emotions                                               |
| Saif Mohammad, the NRC VAD Lexicon                                                                                                                                          | valence, arousal and dominance                                       |
| Daniela Teodorescu and Saif Mohammad                                                                                                                                        | how emotion arcs are judged, and how finely to bin them              |
| Will Hipson and Saif Mohammad                                                                                                                                               | emotion dynamics                                                     |
| Evgeny Kim and Roman Klinger, [REMAN](https://aclanthology.org/C18-1114/) (2018)                                                                                            | emotion in fiction: who feels what, and why                          |
| Emily Öhman, Yuri Bizzoni, Pascale Feldkamp Moreira, Kristoffer Nielbo and Mads Rosendahl Thomsen, EmotionArcs                                                              | emotion arcs at scale, and fractal arcs                              |
| J. A. Meaney and colleagues, [HaHackathon](https://aclanthology.org/2021.semeval-1.9/) (2021)                                                                               | detecting and rating humor                                           |
| Santiago Castro and colleagues, a Spanish humor corpus                                                                                                                      | humor in a second language                                           |
| Katherine Elkins, _The Shapes of Stories_ (2022); Jon Chun, SentimentArcs (2021)                                                                                            | arcs from an ensemble of methods                                     |
| Jianbo Gao, Matthew Jockers and colleagues                                                                                                                                  | multiscale sentiment                                                 |
| Xinyu Tian and colleagues                                                                                                                                                   | narrative judged by language models                                  |
| E. T. Whittaker, Robert Henderson, Paul Eilers, Robert Hodrick and Edward Prescott                                                                                          | the smoother                                                         |

Chapter and scene detection draws on Marti Hearst's [TextTiling](https://aclanthology.org/J97-1003/) (1997), Zehe and colleagues' [Detecting scenes in fiction](https://aclanthology.org/2021.eacl-main.276/) (2021) and Pethe, Kim and Skiena's [Chapter Captor](https://arxiv.org/abs/2011.04163) (2020).
