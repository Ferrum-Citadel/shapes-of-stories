// The About page's credits; a work carries a link only where its address was checked to answer.
export const CREDITS: { work: string; url?: string; gave: string }[] = [
  {
    work: 'Kurt Vonnegut, the "Shape of Stories" lecture and Palm Sunday (1981)',
    gave: 'the fortune axis, the idea of story shapes, and "Which Way Is Up?"',
  },
  {
    work: "Reagan, Mitchell, Kiley, Danforth and Dodds, The emotional arcs of stories are dominated by six basic shapes (2016)",
    url: "https://arxiv.org/abs/1606.07772",
    gave: "the six arcs, the core-stories data behind them, and the hedonometer",
  },
  {
    work: "Matthew Jockers, the Syuzhet package",
    url: "https://cran.r-project.org/web/packages/syuzhet/vignettes/syuzhet-vignette.html",
    gave: "percentage bins, DCT smoothing and the evidence on segment sizes",
  },
  {
    work: "Annie Swafford, Problems with the Syuzhet package (2015), and Ben Schmidt's overview",
    url: "https://annieswafford.wordpress.com/2015/03/02/syuzhet/",
    gave: "the ringing and periodicity critiques",
  },
  {
    work: "Boyd, Blackburn and Pennebaker, The narrative arc (2020)",
    url: "https://www.science.org/doi/10.1126/sciadv.aba2196",
    gave: "narrative arc segments and standardizing within a text",
  },
  {
    work: "Toubia, Berger and Eliashberg, How quantifying the shape of stories predicts their success (2021)",
    url: "https://www.pnas.org/doi/10.1073/pnas.2011695118",
    gave: "250-word windows and story speed",
  },
  {
    work: "Del Vecchio, Kharlamov, Parry and Pogrebna, The data science of Hollywood (2018)",
    url: "https://arxiv.org/abs/1807.02221",
    gave: "arcs measured on films",
  },
  {
    work: "David Wilmot and Frank Keller, Modelling suspense in short stories (2020)",
    url: "https://aclanthology.org/2020.acl-main.161/",
    gave: "tension framed as dramatic tension",
  },
  { work: "Pablo Delatorre and colleagues", gave: "suspense" },
  {
    work: "Saif Mohammad and Peter Turney, the NRC Emotion Lexicon",
    url: "https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm",
    gave: "words tied to emotions",
  },
  { work: "Saif Mohammad, the NRC VAD Lexicon", gave: "valence, arousal and dominance" },
  {
    work: "Daniela Teodorescu and Saif Mohammad",
    gave: "how emotion arcs are judged, and how finely to bin them",
  },
  { work: "Will Hipson and Saif Mohammad", gave: "emotion dynamics" },
  {
    work: "Evgeny Kim and Roman Klinger, REMAN (2018)",
    url: "https://aclanthology.org/C18-1114/",
    gave: "emotion in fiction: who feels what, and why",
  },
  {
    work: "Emily Öhman, Yuri Bizzoni, Pascale Feldkamp Moreira, Kristoffer Nielbo and Mads Rosendahl Thomsen, EmotionArcs",
    gave: "emotion arcs at scale, and fractal arcs",
  },
  {
    work: "J. A. Meaney and colleagues, HaHackathon (2021)",
    url: "https://aclanthology.org/2021.semeval-1.9/",
    gave: "detecting and rating humor",
  },
  {
    work: "Santiago Castro and colleagues, a Spanish humor corpus",
    gave: "humor in a second language",
  },
  {
    work: "Marti Hearst, TextTiling (1997)",
    url: "https://aclanthology.org/J97-1003/",
    gave: "cutting a text where its subject turns",
  },
  {
    work: "Zehe, Konle, Jannidis, Hotho and colleagues, Detecting scenes in fiction (2021)",
    url: "https://aclanthology.org/2021.eacl-main.276/",
    gave: "scene breaks",
  },
  {
    work: "Pethe, Kim and Skiena, Chapter Captor (2020)",
    url: "https://arxiv.org/abs/2011.04163",
    gave: "chapter headings",
  },
  {
    work: "Katherine Elkins, The Shapes of Stories (2022); Jon Chun, SentimentArcs (2021)",
    gave: "arcs from an ensemble of methods",
  },
  { work: "Jianbo Gao, Matthew Jockers and colleagues", gave: "multiscale sentiment" },
  { work: "Xinyu Tian and colleagues", gave: "narrative judged by language models" },
  {
    work: "E. T. Whittaker, Robert Henderson, Paul Eilers, Robert Hodrick and Edward Prescott",
    gave: "the smoother",
  },
  {
    work: "TypeSafe, Jev and its documentation",
    url: "https://docs.typesafe.ai/",
    gave: "typed questions answered as probabilities",
  },
  {
    work: "Project Gutenberg and its volunteers; Constance Garnett and the other translators",
    url: "https://www.gutenberg.org/",
    gave: "the texts of the gallery",
  },
  {
    work: "Claude Fable 5.1 and Opus 5.5, Anthropic's language models",
    gave: "the calibration labels and the shapes expected from the plot, which no person checked row by row",
  },
  { work: "Fountain", url: "https://fountain.io/", gave: "screenplays as plain text" },
  { work: "WebVTT", url: "https://www.w3.org/TR/webvtt1/", gave: "subtitles" },
  { work: "EPUB 3.3", url: "https://www.w3.org/TR/epub-33/", gave: "e-books" },
];
