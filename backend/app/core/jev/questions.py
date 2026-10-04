"""Question set q6: per-beat questions, event and mode prompts, driver instructions."""

from dataclasses import dataclass

QUESTION_SET_VERSION = "q6"
MODEL_ID = "jev-1.13.0"
SCOPE = (
    "Rate only `passage`. `previous_passage_tail` is context from the preceding passage "
    "and is not rated."
)


@dataclass(frozen=True)
class Axis:
    question: str
    levels: list[tuple[str, ...]]  # (description, *examples) for levels 0..4
    note: str | None = None


AXES: dict[str, Axis] = {
    "fortune": Axis(
        "How well are things going for the main characters in `passage` right now, from their own "
        "point of view? Judge the situation the passage shows, rather than the prose style.",
        [
            (
                "Catastrophe or despair: a death, ruin, total defeat, or the lowest point of grief "
                "or hopelessness.",
                "A funeral of a beloved character; the mourners can barely speak.",
                "The hero is captured, the plan has failed, and rescue is impossible.",
            ),
            (
                "Things are going badly: setbacks, danger, loss, humiliation, or fear dominate, "
                "but it is short of the absolute bottom.",
                "A character is fired and cannot pay the rent.",
                "A storm forces the ship off course and supplies run low.",
            ),
            (
                "Mixed or ordinary: everyday life, neutral exposition, or good and bad in balance.",
                "Two friends travel by train and talk about their plans.",
                "A description of the town and its market on a normal morning.",
            ),
            (
                "Things are going well: progress, relief, affection, or modest success; the "
                "characters are better off than before.",
                "A long-lost letter arrives with good news.",
                "The party finally finds the trail after days of searching.",
            ),
            (
                "Triumph or joy: a wedding, a victory, a reunion, a rescue, or an unmistakable "
                "happy ending.",
                "The lovers are reunited and everyone celebrates.",
                "The verdict is innocent and the family embraces.",
            ),
        ],
    ),
    "tension": Axis(
        "How much dramatic tension does `passage` create: an unresolved matter of real consequence "
        "whose outcome the reader is waiting for? Frightening and exciting scenes both count; a "
        "calm scene with a ticking clock also counts.",
        [
            (
                "Zero tension: nothing at stake and nothing pending; reflection, description, or "
                "settled aftermath.",
                "A leisurely description of a garden.",
                "Characters reminisce after the crisis has passed.",
            ),
            (
                "Low: a minor open matter or mild unease.",
                "Someone waits for a reply that is late.",
                "A character notices a stranger watching but thinks little of it.",
            ),
            (
                "Moderate: a clear open matter with real stakes but without immediate danger or "
                "deadline.",
                "The detective lays out three suspects.",
                "A proposal is made and the answer is postponed.",
            ),
            (
                "High: immediate danger, a confrontation under way, or a deadline about to expire.",
                "The car refuses to start as the pursuers approach.",
                "The exam results are read out name by name.",
            ),
            (
                "Peak: a climactic moment fought out or hanging by a thread within the passage: "
                "a duel fought, a death on stage, a confession made.",
                "The duel is fought.",
                "The bomb is defused with seconds left, or it explodes.",
            ),
        ],
    ),
    "mystery": Axis(
        "How strongly does `passage` make the reader want an explanation: a secret kept, a puzzle "
        "posed, an event left unexplained, a stranger whose motives are hidden, or a clue whose "
        "meaning is withheld? Judge the pull toward explanation, rather than danger or excitement. "
        "Judge only what this passage itself withholds, not what the story as a whole keeps "
        "hidden.",
        [
            (
                "None: nothing is withheld and no question is raised; ordinary scenes, "
                "description, jokes, and witty talk belong here even when the wider story has "
                "secrets.",
                "A family eats breakfast and discusses the weather.",
                "A narrator explains the history of the town in full.",
            ),
            (
                "Faint: one small unexplained detail that a reader barely notices.",
                "A letter is mentioned but left unopened.",
                "A neighbor behaves slightly oddly and the moment passes.",
            ),
            (
                "Present: a clear open puzzle the reader notices and expects to be resolved.",
                "A locked room, a missing key, and everyone denies having been there.",
                "A character lies about where they spent the evening.",
            ),
            (
                "Strong: the passage turns on a withheld explanation; clues accumulate and the "
                "reader is actively guessing.",
                "The detective finds the footprint but says nothing of what it means.",
                "An anonymous note names a place and an hour.",
            ),
            (
                "Gripping: the withheld explanation is the whole point of the passage and the "
                "reader is desperate for it.",
                "The stranger's identity is about to be revealed and the chapter stops.",
                "The narrator admits there is something they have kept from us.",
            ),
        ],
    ),
    "humor": Axis(
        "How much of `passage` is comic: jokes, wit, absurdity, farce, comic timing, or a narrator "
        "being funny on purpose? Judge intended comedy, including dark comedy, regardless of "
        "whether it succeeds.",
        [
            (
                "None: zero comic intent.",
                "A deathbed scene written straight.",
                "A technical description of a machine.",
            ),
            (
                "A light touch: an occasional wry remark or one comic detail.",
                "The narrator notes a pompous man's hat.",
                "One dry aside in an otherwise serious conversation.",
            ),
            (
                "Clearly comic moments: several jokes or a comic exchange inside a mostly serious "
                "passage.",
                "Two servants bicker while the master's crisis unfolds.",
                "A witty back-and-forth at dinner.",
            ),
            (
                "Mostly comic: most of the passage is played for laughs, with serious stretches "
                "between the jokes.",
                "A misunderstanding escalates across a whole scene.",
                "A satirical portrait of a committee meeting.",
            ),
            (
                "Comic throughout: the whole passage, start to finish, is played for laughs or "
                "is one comic set piece, even when it is narrated with a straight face.",
                "A slapstick chase through a hotel.",
                "A wedding speech that goes disastrously wrong.",
            ),
        ],
    ),
    "warmth": Axis(
        "How much warmth does `passage` show: affection, kindness, intimacy, belonging, or "
        "tenderness between characters, or from the narrator toward a character? Warmth can be "
        "narrated as well as spoken: a narrator's stated devotion, comfort, or belonging counts "
        "as fully as an exchange between characters.",
        [
            (
                "Cold or hostile: cruelty, contempt, isolation, or clinical detachment.",
                "A prisoner is mocked by guards.",
                "A character eats alone in silence, estranged from everyone.",
            ),
            (
                "Cool: polite or functional interaction without affection.",
                "Colleagues exchange information about a schedule.",
                "A landlord collects the rent.",
            ),
            (
                "Neutral or mixed: ordinary interaction, or affection mixed with friction.",
                "Siblings tease each other while packing.",
                "Neighbors chat about the weather.",
            ),
            (
                "Warm: clear affection, comfort, or generosity.",
                "A friend sits up all night with a sick child.",
                "A father teaches his daughter to ride a bicycle, patient and proud.",
            ),
            (
                "Deeply tender: love, forgiveness, or profound closeness is the heart of the "
                "passage.",
                "A reunion after years apart, with tears and laughter.",
                "A dying grandmother blesses the family at her bedside.",
                "A narrator says she has lived entirely for and with the one she loves best, "
                "and calls those years the happiest.",
            ),
        ],
    ),
    "romance": Axis(
        "How much romantic or sexual charge does `passage` carry between characters: attraction, "
        "flirtation, longing, courtship, a declaration, a kiss, or intimacy? Judge the charge "
        "shown, including unspoken longing, regardless of whether it is returned. The charge "
        "counts when a character speaks of, longs for, or remembers another person, even if "
        "that person is absent from the scene.",
        [
            (
                "None: zero romantic or sexual charge between any characters.",
                "A business negotiation.",
                "A child explores a garden alone.",
            ),
            (
                "A flicker: a glance, a blush, a moment of noticing.",
                "She notices he has remembered her name.",
                "He watches her leave and cannot say why.",
            ),
            (
                "Clear attraction: flirtation, jealousy, or longing that the reader recognizes, "
                "without a declaration.",
                "They dance twice and the room notices.",
                "He rereads her letter for the third time.",
            ),
            (
                "Strong: a declaration, a first kiss, a proposal, or intimacy that changes the "
                "relationship.",
                "He confesses his love in the rain.",
                "They kiss for the first time on the stairs.",
            ),
            (
                "Consuming: the romantic or sexual charge is the whole passage; a wedding night, a "
                "reunion of lovers, or an intimate scene at length.",
                "The lovers spend their first night together.",
                "After years apart they fall into each other's arms and everything else stops.",
            ),
        ],
    ),
    "wonder": Axis(
        "How much wonder does `passage` evoke: awe, the marvelous, the sublime, beauty that stops "
        "the breath, discovery of something vast or strange or new? Judge the sense of a world "
        "opening up, rather than fear or excitement. Wonder can live in reflection as much as in "
        "events: a meditation on the sublime, a vast sea or mountain, or a creature seen for the "
        "first time.",
        [
            (
                "None: the ordinary, described plainly.",
                "A commute to the office.",
                "A list of household accounts.",
            ),
            (
                "A touch: one striking image or a small moment of delight.",
                "The first snow of the year on the rooftops.",
                "A child sees the sea for the first time, briefly.",
            ),
            (
                "Present: a scene of beauty, strangeness, or discovery that the characters pause "
                "over.",
                "The travelers reach the ridge and the whole valley lies below them.",
                "A machine does something everyone thought impossible.",
            ),
            (
                "Strong: awe dominates the passage; the marvelous is described at length.",
                "The doors of the great hall open onto a city of glass.",
                "The astronomer sees the new planet for the first time.",
            ),
            (
                "Overwhelming: the sublime or the miraculous fills the passage and the characters "
                "are transformed by seeing it.",
                "The girl falls through the rabbit hole into a world where everything is wrong and "
                "wonderful.",
                "The ship rises from the sea and the crowd falls silent.",
                "A chapter-long meditation on the terror and beauty of whiteness.",
            ),
        ],
    ),
    "dread": Axis(
        "How much dread does `passage` carry: a growing sense that something bad is coming, "
        "unease, menace, horror, or foreboding? Dread is anticipation and atmosphere, distinct "
        "from the excitement of an action scene.",
        [
            (
                "None: safe, calm, or cheerful.",
                "A picnic on a sunny day.",
                "A business letter.",
            ),
            (
                "Faint unease: a small wrong note or a hint that something is off.",
                "The dog refuses to enter the house.",
                "A letter arrives with an unknown return address.",
            ),
            (
                "Foreboding: the reader senses harm ahead; the characters may be unaware.",
                "The narrator remarks that this was the last time they saw him.",
                "Strange noises from the cellar are dismissed.",
            ),
            (
                "Menace: threat is present and pressing; horror or looming catastrophe.",
                "Footsteps follow her through the fog.",
                "The doctor's face changes as he reads the chart.",
            ),
            (
                "Horror or doom: terror, atrocity, or inescapable catastrophe dominates.",
                "The creature is in the room.",
                "The village learns the plague has reached them.",
            ),
        ],
    ),
    "sorrow": Axis(
        "How much sorrow does `passage` carry: grief, loss, loneliness, regret, or melancholy, in "
        "the characters or in the narrator's tone? Judge the sadness felt, rather than whether "
        "events are going badly; a happy event told with regret still carries sorrow.",
        [
            (
                "None: zero sadness in the characters or the telling.",
                "A brisk account of a successful business deal.",
                "Children play in a yard on a summer afternoon.",
            ),
            (
                "A shadow: a wistful note, a passing regret, a small loss.",
                "She finds an old photograph and puts it away again.",
                "He mentions his late father once and changes the subject.",
            ),
            (
                "Present: sadness is clearly felt but the passage carries on.",
                "The family packs up the house they grew up in.",
                "A friendship ends politely and both know it.",
            ),
            (
                "Heavy: grief or loneliness dominates the passage.",
                "A widow sets two places at the table out of habit.",
                "A soldier reads the list of the dead and finds his brother's name.",
            ),
            (
                "Devastating: overwhelming grief or desolation is the whole passage.",
                "A mother holds her dead child and refuses to let go.",
                "The old man realizes nobody is coming, and nobody ever will.",
            ),
        ],
    ),
    "pace": Axis(
        "How fast does the story move in `passage`?",
        [
            (
                "Still: nothing happens in the story's present; the passage describes, reflects, "
                "explains, or sums up.",
                "A place, a person or a custom described at length.",
                "A narrator's thoughts, or a summary of earlier or habitual events.",
            ),
            (
                "Slow: one quiet scene that ends where it began; people talk, wait, walk or eat, "
                "and little changes.",
                "A long conversation that settles nothing.",
                "A small errand or arrival told at leisure.",
            ),
            (
                "Steady: the scene moves forward at an even walk; things are said and done that "
                "change the situation, with room for talk and description around them.",
                "A visit, a disagreement, a decision.",
                "A turn in the plot reached through conversation.",
            ),
            (
                "Brisk: a burst of action or a run of quick turns takes up part of the passage, "
                "and the rest is build-up, talk, or aftermath.",
                "A fight or chase that is over before the passage ends.",
                "Sudden events followed by the characters taking stock.",
            ),
            (
                "Breathless: action or rapid turns run through almost the whole passage, one "
                "development following another with hardly a pause.",
                "A battle, chase or struggle told blow by blow to the end.",
                "Revelations or reversals arriving one on top of another.",
            ),
        ],
        note=(
            "Judge what happens and changes in the story's present, rather than sentence length "
            "or how exciting the subject is. In a play, what happens on stage counts: a fight, a "
            "death, an exit, a discovery."
        ),
    ),
}

EVENTS: dict[str, str] = {
    "reveal": (
        "In `passage`, does a character or the reader learn something important that was hidden or "
        "unknown until now: a secret, an identity, a twist, or a discovery? News of an outcome "
        "that was never hidden, such as a wedding announced or a death reported, does not by "
        "itself count."
    ),
    "death": (
        "Does a character die, or is a death reported or discovered, in `passage`? Count a death "
        "announced in dialogue or someone found dead; do not count a death that happened earlier "
        "and is only remembered or mourned."
    ),
    "arrival_departure": (
        "Does someone arrive at, or leave, the place where the scene is set, in a way that changes "
        "the scene?"
    ),
    "location_change": (
        "Is `passage` set in a different place from `previous_passage_tail`, or does the setting "
        "move to a different place within `passage`? A place that is only told about, "
        "remembered, or seen from afar does not count; the action itself must move."
    ),
    "confrontation": (
        "Is there open conflict in `passage`: an argument, a fight, a threat, or a standoff "
        "between characters? An attack or a killing counts as a fight."
    ),
    "reconciliation": "Do characters make peace, forgive, apologize, or reunite in `passage`?",
    "decision": (
        "Does a character make up their mind in `passage`: a stated resolve, or a choice shown "
        "as being chosen, on which the story turns? A violent act or a revelation by itself does "
        "not count unless the choosing is shown."
    ),
    "betrayal": (
        "In `passage`, does a character betray someone who trusted them: a mutiny or deception "
        "plotted or carried out, a secret sold, a promise broken for gain, a lover or dependent "
        "deserted, or someone handed over to their enemies? A betrayal that comes to light or is "
        "reported in `passage` counts as well as one carried out in it."
    ),
    "injury_violence": (
        "In `passage`, is a character physically hurt, attacked, or killed, or is violence done to "
        "a body, on the page rather than reported from long ago?"
    ),
}

MODE = {
    "type": "choice",
    "instructions": "Which best describes most of `passage`?",
    "criteria": {
        "action": "characters doing things and events unfolding",
        "dialogue": "characters talking",
        "description": "places, people, or objects described",
        "reflection": "a character's or narrator's thoughts and feelings",
        "exposition": "background, history, or explanation",
    },
}

TEXT_KIND = {
    "type": "choice",
    "instructions": "What kind of text is `passage` taken from?",
    "criteria": {
        "prose_fiction": "a novel, short story, or memoir told in prose",
        "screenplay_or_play": (
            "a screenplay or stage play with scene headings, character cues, and dialogue lines"
        ),
        "transcript": "a conversation, interview, or subtitle transcript",
        "nonfiction": "an essay, report, article, or textbook",
        "poetry_or_lyrics": "poetry or song lyrics",
        "other": "something else",
    },
}

# Driver instructions (not part of the per-beat question set): the axis's own question first,
# so the pick and the score share one criterion, then which option to choose. The options are
# a beat's driver chunks (core/text.py), so they are called options rather than paragraphs.
_DRIVER_ASK: dict[str, str] = {
    "fortune": (
        "Which single option most strongly shows how well or badly things are going for the "
        "characters?"
    ),
    "tension": "Which single option most strongly creates dramatic tension?",
    "mystery": "Which single option most strongly makes the reader want an explanation?",
    "humor": "Which single option is the funniest on purpose?",
    "warmth": "Which single option shows the most warmth between characters?",
    "romance": "Which single option carries the strongest romantic or sexual charge?",
    "wonder": "Which single option evokes the most wonder or awe?",
    "dread": "Which single option carries the most dread or foreboding?",
    "sorrow": "Which single option carries the most sorrow?",
    "pace": "Which single option does the most happen in?",
}
_DRIVER_TIE_BREAK = "If several qualify, choose the one whose wording is most direct."


def _driver_instruction(axis: str) -> str:
    # The driver request sends no passage: the text arrives as the options, and the model reads
    # literally, so the axis question must speak of options.
    q = (
        AXES[axis]
        .question.replace("this passage", "this option")
        .replace("the passage", "the option")
        .replace("`passage`", "each option")
    )
    return f"{q} {_DRIVER_ASK[axis]} {_DRIVER_TIE_BREAK}"


DRIVER_QUESTIONS: dict[str, str] = {axis: _driver_instruction(axis) for axis in AXES}


def build_questions(with_gate: bool) -> dict:
    q: dict = {}
    for axis, a in AXES.items():
        instructions = {"scope": SCOPE, "question": a.question}
        if a.note:
            instructions["note"] = a.note
        q[axis] = {
            "type": "score",
            "instructions": instructions,
            "criteria": [{"description": lvl[0], "examples": list(lvl[1:])} for lvl in a.levels],
        }
    for name, text in EVENTS.items():
        q[name] = {"type": "noul", "instructions": text}
    q["mode"] = MODE
    if with_gate:
        q["text_kind"] = TEXT_KIND
    return q
