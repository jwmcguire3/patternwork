// Auto-generated from selfmap_v4_question_bank.xlsx
export type QuestionData = {
  num: number;
  category: string;
  axis: string;
  load: "mild" | "moderate" | "high";
  ic: string;
  scenarioTag: string;
  text: string;
  options: Record<string, string>;
  bodyPrompt: "standard" | "enhanced";
  supportsImpulse: boolean;
};

type QuestionRow = Omit<QuestionData, "supportsImpulse">;

const QUESTION_ROWS = [
  {
    "num": 1,
    "category": "state",
    "axis": "1",
    "load": "mild",
    "ic": "",
    "scenarioTag": "pressured_to_back_down",
    "text": "Someone is pressuring you to agree with something you don't believe is right. What happens in you first?",
    "options": {
      "A": "I stay with my position and try to understand where they're coming from.",
      "B": "I start calculating — what's the cost of pushing back vs going along?",
      "C": "My mind races through arguments, counterpoints, and what might happen next.",
      "D": "I feel myself getting smaller. The pressure to agree is easier than the fight.",
      "E": "Something flares — resistance, heat, the urge to push back hard.",
      "F": "I disconnect a little. It's like the pressure creates a wall between me and the moment."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 2,
    "category": "att",
    "axis": "4",
    "load": "mild",
    "ic": "",
    "scenarioTag": "misread_by_someone",
    "text": "Someone you care about completely misreads your intentions — they think you meant something you didn't. What happens in you first?",
    "options": {
      "A": "I try to clarify calmly, trusting we can work it out.",
      "B": "I rush to correct it — explaining, reassuring, making sure they understand.",
      "C": "My mind starts going through how this happened and whether they'll ever really understand me.",
      "D": "I give up a little. If they don't get it, maybe it's not worth explaining.",
      "E": "Frustration or hurt flares — being misunderstood by someone who should know better.",
      "F": "I disengage slightly. The gap between us feels like something I can't bridge right now."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 3,
    "category": "att",
    "axis": "4",
    "load": "mild",
    "ic": "",
    "scenarioTag": "closeness_offered_unexpected",
    "text": "Someone you're not very close to offers unexpected warmth or emotional openness. What happens in you first?",
    "options": {
      "A": "I receive it and try to stay present with the gesture.",
      "B": "I reciprocate quickly — matching their energy so things stay comfortable.",
      "C": "I start wondering what they want or what this means.",
      "D": "I pull back slightly. The closeness feels like more than I was ready for.",
      "E": "Something lights up — a flicker of warmth or intensity I wasn't expecting.",
      "F": "I feel myself go a bit blank, like the unexpected closeness short-circuits something."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 4,
    "category": "state",
    "axis": "2",
    "load": "mild",
    "ic": "",
    "scenarioTag": "ending_chosen",
    "text": "You decide to end something — a project, a habit, a chapter — that's been part of your life for a while. What happens in you first?",
    "options": {
      "A": "I sit with the weight of it and let the transition feel real.",
      "B": "I shift into planning mode — what's next, how to make the transition smooth.",
      "C": "I second-guess myself, replaying whether it's really the right call.",
      "D": "A quiet emptiness settles in. Something just got smaller.",
      "E": "There's an unexpected wave of emotion — relief mixed with grief or intensity.",
      "F": "I feel strangely detached from it, like the decision was made by someone else."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 5,
    "category": "ifs",
    "axis": "4,5",
    "load": "mild",
    "ic": "",
    "scenarioTag": "people_pleasing_noticed",
    "text": "You catch yourself adjusting your behavior to make someone else comfortable — saying what they want to hear instead of what's true. What happens when you notice?",
    "options": {
      "A": "I pause and consider whether I want to course-correct.",
      "B": "I keep going — it's easier to stay smooth than to risk disruption.",
      "C": "I start analyzing why I do this and what it costs me.",
      "D": "I feel tired. Like the effort of performing is draining something.",
      "E": "There's a flash of frustration — at myself, at the pattern, at the situation.",
      "F": "I notice it vaguely but don't fully engage with what it means."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 6,
    "category": "ifs",
    "axis": "4",
    "load": "mild",
    "ic": "",
    "scenarioTag": "genuine_presence",
    "text": "Think of a moment where you were fully yourself with someone — not performing, not managing, not analyzing, just present. What did that feel like inside, and what made it possible?",
    "options": {
      "A": "It felt easy and grounded. I think I trusted them and trusted myself enough to stop efforting.",
      "B": "I'm not sure I've fully had that. There's usually some part of me monitoring how I'm landing.",
      "C": "I can remember moments like that but even now my mind starts picking them apart.",
      "D": "That kind of openness feels risky. When I've had it, it was brief before something in me retreated.",
      "E": "When it happens, the aliveness of it is intense — almost too much. Being fully present carries a lot of charge.",
      "F": "I have a hard time accessing what that would feel like. The idea makes sense but the feeling is remote."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 7,
    "category": "att",
    "axis": "4",
    "load": "mild",
    "ic": "",
    "scenarioTag": "after_good_connection",
    "text": "After a moment of real connection with someone — warmth, honesty, feeling seen — what happens in you once you're alone?",
    "options": {
      "A": "I sit with the warmth and let it settle.",
      "B": "I start thinking about what to do next to maintain the connection.",
      "C": "I replay the interaction, analyzing whether it was as real as it felt.",
      "D": "The warmth fades quickly and I feel emptier than before.",
      "E": "The feelings linger with intensity — it meant more than I expected.",
      "F": "I'm already at a distance from it. The connection felt real in the moment but now it's hard to access."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 8,
    "category": "att",
    "axis": "4",
    "load": "mild",
    "ic": "",
    "scenarioTag": "someone_too_close_too_fast",
    "text": "Someone is moving toward you faster than you're comfortable with — more texts, more plans, more emotional intensity. What happens in you first?",
    "options": {
      "A": "I notice my discomfort and try to communicate my pace honestly.",
      "B": "I match some of their energy to avoid hurting them while subtly slowing things down.",
      "C": "I start analyzing: is this too much, or am I the one with the problem?",
      "D": "I pull back. The more they push forward, the more I need space.",
      "E": "Something reacts — annoyance, pressure, or a trapped feeling that spikes fast.",
      "F": "I start tuning them out. The intensity triggers a disconnect rather than engagement."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 9,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "Y",
    "scenarioTag": "partner_goes_cold",
    "text": "Someone you're close to suddenly feels distant — shorter texts, less warmth, no clear reason. What happens in you first?",
    "options": {
      "A": "I check in with them directly rather than assuming.",
      "B": "I start adjusting my behavior — being warmer, more careful, trying to close the gap.",
      "C": "My mind locks on and starts scanning every interaction for what went wrong.",
      "D": "I match their distance. I pull back too.",
      "E": "I feel a spike of anxiety or urgency — something's wrong and my body knows first.",
      "F": "I go a bit numb. The uncertainty puts me in a fog."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 10,
    "category": "state",
    "axis": "1",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "anger_cant_express",
    "text": "You feel angry about something but the situation doesn't feel safe to express it. What happens in you first?",
    "options": {
      "A": "I notice the anger and try to stay steady with it, even if I can't say it.",
      "B": "I redirect — find a way to be productive or channel it into something useful.",
      "C": "My mind starts building the case for why I'm right, rehearsing what I'd say.",
      "D": "The anger folds inward and my energy drops.",
      "E": "The pressure builds — it feels physical, like heat or tightness.",
      "F": "I go a bit numb, like the anger gets muffled or far away."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 11,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "being_one_who_cares_more",
    "text": "You realize you're investing more in a relationship than the other person is. What happens in you first?",
    "options": {
      "A": "I try to see it clearly — is this a pattern, or just a moment?",
      "B": "I start adjusting — pulling back my investment to match theirs.",
      "C": "I analyze it from every angle: am I reading this right? Why do I always end up here?",
      "D": "I withdraw quietly. My energy toward them drops.",
      "E": "It stings — there's a sharp feeling of something unfair or painful.",
      "F": "I stop feeling much about it. Like something in me files it away."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 12,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "asked_to_be_vulnerable",
    "text": "Someone asks you to share something personal — how you're really doing, what's going on underneath. What happens in you first?",
    "options": {
      "A": "I check whether this person and this moment feel safe enough, then share what I can.",
      "B": "I give them something — enough to seem open without going too deep.",
      "C": "I start evaluating: what do they want to hear, what's safe to say, what might backfire.",
      "D": "I deflect or go vague. Something in me doesn't want to be seen right now.",
      "E": "Something rises — emotion, pressure, the weight of what I could say.",
      "F": "I go a little blank. The question feels like it's hitting a wall I can't see past."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 13,
    "category": "state",
    "axis": "2",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "sadness_unexpected",
    "text": "Something reminds you of a loss — a song, a place, a smell — and sadness hits you unexpectedly. What happens in you first?",
    "options": {
      "A": "I let the feeling land and stay with it for a moment.",
      "B": "I acknowledge it but shift focus — I have things to do.",
      "C": "My mind goes to the memory and starts replaying details, analyzing what I feel.",
      "D": "I go quiet inside. The energy drops and everything gets heavier.",
      "E": "The emotion hits hard and fast — like a wave or a pressure in my chest.",
      "F": "I feel it start to come up but then it's like a fog rolls in and mutes everything."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 14,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "receiving_care",
    "text": "Someone who cares about you notices you're struggling and offers help — not because you asked, but because they saw it. What happens in you first?",
    "options": {
      "A": "I let it in. Something in me softens and I accept the help.",
      "B": "I thank them but start managing it — showing them I'm handling it, minimizing what they saw.",
      "C": "I start evaluating: do they really mean it? What will I owe them? Is this safe to accept?",
      "D": "I deflect. I say I'm fine and move the attention off me.",
      "E": "Something wells up — the offer lands harder than expected and emotion rises fast.",
      "F": "I hear them but it doesn't quite land. Like the care is reaching for something in me that isn't there right now."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 15,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "unseen_by_someone_close",
    "text": "You're with someone who matters to you but you feel invisible — like they're not really seeing you. What happens in you first?",
    "options": {
      "A": "I try to name what I'm feeling and decide whether to say something.",
      "B": "I try to become more visible — more engaging, more helpful, more present.",
      "C": "I start analyzing why: is it me? Is it them? What am I not doing?",
      "D": "I dim. I stop trying to be seen and get quieter.",
      "E": "There's a hurt that rises — a sting of not mattering enough.",
      "F": "I check out a bit. If I'm not being seen, part of me stops showing up."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 16,
    "category": "ifs",
    "axis": "1,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "conflict_someone_you_love",
    "text": "You're in a disagreement with someone you love. It's getting heated. What happens in you first?",
    "options": {
      "A": "I try to stay connected to them even while disagreeing.",
      "B": "I start managing the temperature — softening my tone, choosing words carefully.",
      "C": "I get caught between wanting to be heard and analyzing what will happen if I push back.",
      "D": "I go quiet. I let them have the floor and retreat inside.",
      "E": "The emotional charge rises — I feel it before I can think about strategy.",
      "F": "I check out a little. The intensity makes something in me step back from the whole scene."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 17,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "relationship_changing_shape",
    "text": "A close relationship is shifting — not ending, but becoming something different than what it was. What happens in you first?",
    "options": {
      "A": "I try to be present with the change rather than fighting or rushing it.",
      "B": "I start negotiating — how do we make this work, what's the new arrangement.",
      "C": "I analyze what it means: is this growth or loss? Am I okay with this?",
      "D": "I go quiet. I let the distance grow rather than shaping the change.",
      "E": "There's a surge of feeling — grief, resistance, or intensity about what's being lost.",
      "F": "I feel oddly detached from it, like the shift hasn't fully landed yet."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 18,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "watching_them_connect",
    "text": "You watch someone you care about deeply connecting with someone else — laughing, open, easy. What happens in you first?",
    "options": {
      "A": "I try to appreciate their connection without making it about me.",
      "B": "I adjust — maybe I need to be more like that, or try harder when I'm with them.",
      "C": "My mind starts comparing: why is it easy with them and not with me?",
      "D": "I go quiet and feel myself pull inward. Something deflates.",
      "E": "A sharp feeling — jealousy, hurt, or longing — hits before I can contextualize it.",
      "F": "I observe it but feel strangely far from the emotion. Like watching a scene I'm not in."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 19,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "closeness_as_overwhelm",
    "text": "Someone you care about wants more emotional closeness than you're comfortable with — they want to go deeper. What happens in you first?",
    "options": {
      "A": "I try to be honest about my pace without shutting them down.",
      "B": "I give them some of what they want — enough to satisfy without going past my limit.",
      "C": "I start calculating: how much is enough? What happens if I say no?",
      "D": "I feel the pull to retreat. Their wanting more makes me want to give less.",
      "E": "Something flares — irritation, pressure, or a feeling of being cornered by their need.",
      "F": "I go a bit blank. Their desire for closeness hits something in me that shuts off rather than opens."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 20,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "being_needed_as_burden",
    "text": "Someone you care about is leaning on you emotionally — they need your presence and emotional availability. What happens in you?",
    "options": {
      "A": "I can show up for them and stay present without losing myself.",
      "B": "I show up but I'm performing availability — doing the right things while internally tracking my depletion.",
      "C": "I'm torn between wanting to help and analyzing whether this is sustainable for either of us.",
      "D": "I feel the weight of it. Their need creates a heaviness that makes me want to retreat.",
      "E": "Something flares — resentment, claustrophobia, or frustration I feel guilty about.",
      "F": "I'm there physically but I notice myself checking out. Their need pushes me further away."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 21,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "Y",
    "scenarioTag": "relying_and_it_holds",
    "text": "You let yourself depend on someone for something that matters — and they come through completely. What happens in you?",
    "options": {
      "A": "I feel genuinely held. The trust deepens and something in me relaxes.",
      "B": "I feel grateful but immediately start thinking about how to reciprocate or balance the exchange.",
      "C": "Part of me wonders if this will keep happening or if it was a one-time thing.",
      "D": "I feel a strange discomfort. Being held like that is unfamiliar and part of me pulls back.",
      "E": "It hits me emotionally — the relief or gratitude is intense, maybe unexpectedly so.",
      "F": "I register that it happened but can't fully feel the weight of it."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 22,
    "category": "ifs",
    "axis": "5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "self_blame_after_rupture",
    "text": "After something goes wrong in a relationship, your mind starts telling you it was your fault. What happens in you first?",
    "options": {
      "A": "I notice the self-blame and try to hold it without fully believing it.",
      "B": "I start working on how to make it right — if it's my fault, I need to fix it.",
      "C": "I get stuck analyzing: was it me? What exactly did I do? Could I have prevented this?",
      "D": "I absorb the blame quietly. My energy drops and I stop defending myself.",
      "E": "The self-blame hits with emotional force — shame, heat, or a sinking feeling.",
      "F": "I feel detached from the whole thing, like the guilt is happening at arm's length."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 23,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "initiation_goes_well",
    "text": "You take a risk and reach out to someone — and they respond with genuine warmth. What happens in you after it lands?",
    "options": {
      "A": "I feel the warmth settle in. It feels real and I let myself have it.",
      "B": "I immediately start thinking about how to maintain this — what to say next.",
      "C": "I start analyzing: was that real? Will it last? Did I get lucky?",
      "D": "Something in me pulls back a little, even though it went well.",
      "E": "The relief or joy hits with surprising intensity — almost too much feeling.",
      "F": "I notice it happened but I can't quite feel it. Like the good news is behind glass."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 24,
    "category": "ifs",
    "axis": "2,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "protecting_soft_feeling",
    "text": "A soft, tender feeling starts to surface — maybe sadness, maybe longing, maybe hope. What happens in you first?",
    "options": {
      "A": "I make space for it. I let it exist without needing to do anything.",
      "B": "I notice it but redirect my attention to something practical.",
      "C": "I start analyzing it: where is this coming from? Is it safe to feel this?",
      "D": "The feeling starts to surface but then something in me dims it. It goes quiet.",
      "E": "The tenderness hits with surprising force — more than I expected.",
      "F": "I feel it at a distance, like it belongs to a version of me I can't quite reach."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 25,
    "category": "ifs",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "protector_vs_desire",
    "text": "You want to reach out to someone — to connect, to be honest, to ask for something — but something in you holds back. What wins?",
    "options": {
      "A": "I notice the pull in both directions and make a choice based on what feels right.",
      "B": "I find a compromise — reach out, but in a way that's careful and managed.",
      "C": "I get stuck going back and forth: what if it goes wrong? What if I don't?",
      "D": "The hold-back wins. I stay quiet.",
      "E": "The desire to reach out pulses with urgency, but the hesitation is just as strong.",
      "F": "I lose track of the impulse. By the time I think about it again, the moment has passed."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 26,
    "category": "att",
    "axis": "4,5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "asking_for_help",
    "text": "You're in over your head and genuinely need help from someone. Not a small favor — real help. What happens as you consider asking?",
    "options": {
      "A": "I recognize the need and start figuring out who to ask and how.",
      "B": "I try to minimize the ask — frame it as small, reduce what I actually need.",
      "C": "I get stuck weighing it: what if they say no? What if they judge me?",
      "D": "I probably won't ask. Something in me would rather struggle alone than need someone.",
      "E": "The vulnerability of needing help creates urgency or distress.",
      "F": "I know I need help but I can't quite connect to the impulse to ask. The need feels far away."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 27,
    "category": "state",
    "axis": "1,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "criticized_by_stranger_vs_loved",
    "text": "Think about being sharply criticized by a stranger versus by someone you love. How does your response CHANGE between the two?",
    "options": {
      "A": "With a stranger I shrug it off more easily. With someone I love, I take it in more carefully.",
      "B": "With a stranger I manage my reaction. With someone I love I manage THEIR reaction.",
      "C": "With a stranger I dismiss it but still replay it. With someone I love I replay it endlessly.",
      "D": "With a stranger I go cold and move on. With someone I love I go quiet and shrink.",
      "E": "With a stranger I fire back. With someone I love the anger is mixed with hurt — it's sharper.",
      "F": "With a stranger I barely register it. With someone I love I still go numb, but the numbness is heavier."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 28,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "vulnerability_context_shift",
    "text": "Imagine sharing something personal with an acquaintance versus the person closest to you. How does what happens inside you change?",
    "options": {
      "A": "With an acquaintance it's lighter. With my closest person, it matters more but I can go deeper.",
      "B": "With an acquaintance I curate what I share. With my closest person I still curate, just differently.",
      "C": "With an acquaintance I don't overthink it much. With my closest person I analyze every word.",
      "D": "With an acquaintance I can be surprisingly open. With my closest person I hold back more.",
      "E": "With an acquaintance it's low charge. With my closest person the same words carry so much more weight.",
      "F": "With an acquaintance I stay present. With my closest person something in me distances."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 29,
    "category": "ifs",
    "axis": "5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "self_vs_other_same_pain",
    "text": "A close friend is going through the exact same difficulty you're going through. You feel compassion for them easily. But when you try to extend that to yourself, what changes?",
    "options": {
      "A": "I can give myself the same warmth, though it takes more effort.",
      "B": "I turn my compassion into action for them but into a to-do list for myself.",
      "C": "For them it's simple. For me, my mind argues: 'you don't deserve the same kindness.'",
      "D": "I can feel for them but when I turn inward, the feeling collapses.",
      "E": "Trying to give myself compassion opens something painful — easier to care for them than feel my own need.",
      "F": "I can feel for them clearly. When I turn it toward myself, there's just nothing there."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 30,
    "category": "ifs",
    "axis": "2,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "tenderness_unlocks_self",
    "text": "You feel deep tenderness for someone vulnerable. In that tenderness, something about YOUR pain becomes visible too. What happens?",
    "options": {
      "A": "I hold both — their pain and mine — and let myself feel the connection between them.",
      "B": "I focus on them. Their pain I can handle; mine I'll set aside for now.",
      "C": "I notice the parallel and start analyzing: why does their pain unlock mine?",
      "D": "My own pain surfaces and my energy drops. The tenderness becomes heaviness.",
      "E": "The combined feeling is intense — compassion for them and grief for myself hit at the same time.",
      "F": "I can feel tenderness for them clearly but my own pain stays at a distance."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 31,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "Y",
    "scenarioTag": "deep_trust_shaken",
    "text": "The one person you trust most does something that shakes that trust — not a betrayal, but a crack. What happens in you first?",
    "options": {
      "A": "I stay with the discomfort and try to keep the relationship in perspective.",
      "B": "I start working to repair it immediately — asking questions, bridging the gap.",
      "C": "My mind loops: how could this happen, what does it mean about us, about me.",
      "D": "I retreat inside. The warmth I felt gets replaced by something quieter and colder.",
      "E": "The hurt is immediate and physical — chest, stomach, pressure.",
      "F": "I feel distant from it, like the crack happened to a version of me that's somewhere else."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 32,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "",
    "scenarioTag": "someone_dishonest",
    "text": "You find out someone close to you hasn't been honest about something that matters. What happens in you first?",
    "options": {
      "A": "I try to understand the full picture before reacting.",
      "B": "I start figuring out how to address it without blowing things up.",
      "C": "My mind goes into overdrive — what else have they lied about, what did I miss.",
      "D": "Something in me goes cold and quiet. The connection dims.",
      "E": "The betrayal hits hard — a surge of anger, hurt, or disbelief.",
      "F": "I feel strangely calm, almost detached, like I'm processing it from a distance."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 33,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "",
    "scenarioTag": "repair_attempt_rejected",
    "text": "You try to repair something after a conflict and the other person isn't receptive. What happens in you first?",
    "options": {
      "A": "I accept that they need more time and try not to force it.",
      "B": "I try harder — different words, different approach, anything to fix it.",
      "C": "My mind runs through everything: what I did, what they need, whether this can be salvaged.",
      "D": "I stop trying. Something in me closes off.",
      "E": "Frustration or hurt flares — I tried and it wasn't enough.",
      "F": "I feel disconnected from the whole thing. Like it's happening at a distance."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 34,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "Y",
    "scenarioTag": "rare_bond_threatened",
    "text": "Someone you've let in deeply — one of very few people — starts pulling away. You can feel the distance growing. What happens in you first?",
    "options": {
      "A": "I try to stay grounded and check whether what I'm sensing is accurate.",
      "B": "I start working harder to keep them close — being more available, more accommodating.",
      "C": "My mind runs through everything: what changed, what I did, what's coming.",
      "D": "I start preparing to lose them. I begin closing off before they finish leaving.",
      "E": "The intensity of it hits my body first — it's not just emotional, it's physical.",
      "F": "Part of me goes somewhere else. The magnitude of it is too much to fully feel right now."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 35,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "",
    "scenarioTag": "opened_up_they_pulled_away",
    "text": "After a moment of real vulnerability, you sense the other person pulling back rather than moving closer. What happens in you first?",
    "options": {
      "A": "I try to sit with the uncertainty without assuming the worst.",
      "B": "I start managing the situation — reassuring them, downplaying what I shared.",
      "C": "I replay everything: was it too much? Did I misread the moment?",
      "D": "I close back up. The door I opened starts shutting.",
      "E": "Rejection hits physically — a sharp contraction somewhere in my body.",
      "F": "I go numb. The emotional exposure followed by distance is too much to process."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 36,
    "category": "att",
    "axis": "4",
    "load": "high",
    "ic": "Y",
    "scenarioTag": "vulnerability_received_well",
    "text": "You share something deeply personal and the other person receives it with genuine care. They don't fix it, just hold it with you. What happens?",
    "options": {
      "A": "Something in me lands. I feel less alone with it and I let that be enough.",
      "B": "I feel relieved but start checking their face — making sure I didn't burden them.",
      "C": "My mind starts processing: do they really understand? Will this change how they see me?",
      "D": "I feel exposed. Even though they received it well, something in me wants to take it back.",
      "E": "Emotion comes up hard — tears, pressure, shaking — like the sharing opened a dam.",
      "F": "I feel distant from the moment. I can see that it went well but I can't fully feel it."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 37,
    "category": "ifs",
    "axis": "1",
    "load": "high",
    "ic": "",
    "scenarioTag": "rage_rising_cant_act",
    "text": "You feel rage building — something deeply unfair happened — but you can't act on it right now. What happens in you first?",
    "options": {
      "A": "I try to contain it without suppressing it — hold it until I can deal with it.",
      "B": "I channel it into something — work, cleaning, exercise, anything productive.",
      "C": "My mind starts building an airtight case for why I'm right and they're wrong.",
      "D": "The rage collapses into something heavier — exhaustion or resignation.",
      "E": "The intensity is overwhelming — heat, pressure, trembling.",
      "F": "I go numb. The rage was there and then it wasn't, like a switch got flipped."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 38,
    "category": "ifs",
    "axis": "1,5",
    "load": "high",
    "ic": "",
    "scenarioTag": "criticized_publicly",
    "text": "Someone criticizes you in front of others. What happens in you first?",
    "options": {
      "A": "I try to take in what's useful and let go of what's not.",
      "B": "I manage my face and my response — whatever keeps this from getting worse.",
      "C": "My mind races: was the criticism fair? What do the others think now?",
      "D": "I shrink. I want to disappear or be invisible.",
      "E": "Heat rises — embarrassment, anger, or a sharp defensive impulse.",
      "F": "I disconnect from the moment. I'm there but not feeling it fully."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 39,
    "category": "ifs",
    "axis": "2",
    "load": "high",
    "ic": "",
    "scenarioTag": "grief_wont_complete",
    "text": "There's a grief you've been carrying for a long time that hasn't fully moved through you. When it surfaces, what happens first?",
    "options": {
      "A": "I try to make space for it, even though it's uncomfortable.",
      "B": "I acknowledge it briefly and redirect to something I can control.",
      "C": "I start analyzing it again — why won't it move, what am I missing.",
      "D": "The heaviness comes. I feel it pull me down and I don't resist.",
      "E": "It hits with fresh intensity, like it just happened, even though it didn't.",
      "F": "I feel the edges of it but can't fully get there. Something keeps me at a distance."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 40,
    "category": "ifs",
    "axis": "2,4",
    "load": "high",
    "ic": "",
    "scenarioTag": "old_pain_safe_moment",
    "text": "You're in a safe, quiet moment — nothing is wrong — and an old pain surfaces. Not a thought, but the feeling itself. What happens in you first?",
    "options": {
      "A": "I make room for it. I let it come without trying to understand it yet.",
      "B": "I notice it and gently redirect. Now isn't the time.",
      "C": "I immediately start trying to figure out where it came from and what triggered it.",
      "D": "I feel myself going heavy and low, like the feeling is pulling me under.",
      "E": "It hits with force — raw and present, like it just happened even though it didn't.",
      "F": "I feel it start to come up and then something closes. I'm aware it was there but I can't reach it."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 41,
    "category": "ifs",
    "axis": "4",
    "load": "high",
    "ic": "Y",
    "scenarioTag": "seen_reaches_something_young",
    "text": "Someone sees something in you that you usually keep hidden — a softer, younger, more unguarded part. And they treat it gently. What happens?",
    "options": {
      "A": "Something in me that's been waiting to be seen finally relaxes.",
      "B": "I smile and move on quickly — appreciating it but not letting the moment go too deep.",
      "C": "I freeze for a second, trying to figure out how they saw that and what it means.",
      "D": "I pull back. Being seen like that feels too exposed, even though they were kind.",
      "E": "Something breaks open — emotion rises fast, more than the moment seems to warrant.",
      "F": "I hear what they're saying but it's reaching for a part of me that's not available right now."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 42,
    "category": "state",
    "axis": "3",
    "load": "high",
    "ic": "",
    "scenarioTag": "overwhelm_too_much",
    "text": "Too many things hit at once — demands, emotions, decisions — and your system starts to overload. What happens in you first?",
    "options": {
      "A": "I try to slow down and pick one thing to focus on.",
      "B": "I speed up — start doing things faster, trying to stay on top of it all.",
      "C": "My mind fragments — jumping between everything, unable to settle.",
      "D": "I shut down. Everything gets quiet and I stop being able to act.",
      "E": "The pressure spikes physically — chest tight, body buzzing, something needs to move.",
      "F": "I check out. My body stays but some part of me goes offline."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 43,
    "category": "state",
    "axis": "2,5",
    "load": "high",
    "ic": "",
    "scenarioTag": "self_compassion_blocked",
    "text": "You're going through something hard and try to be kind to yourself — but something blocks it. What blocks it?",
    "options": {
      "A": "Nothing blocks it — I can access self-compassion, though it takes effort.",
      "B": "I feel like I don't deserve kindness until I've fixed the problem.",
      "C": "My mind argues with the self-compassion: 'you don't get to feel better yet.'",
      "D": "I can't reach myself. It's like the kindness can't get through.",
      "E": "There's a surge of pain when I try — being kind to myself opens a door I'm not ready for.",
      "F": "I go blank when I try. The self-compassion doesn't land; it just bounces off."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 44,
    "category": "state",
    "axis": "1,4",
    "load": "high",
    "ic": "",
    "scenarioTag": "escalation_sequence",
    "text": "A difficult situation starts small but keeps escalating — each attempt to resolve it makes it worse. What happens as it builds?",
    "options": {
      "A": "I start steady, stay engaged longer than most, but eventually need to step away.",
      "B": "I manage harder and harder until the effort itself becomes the problem.",
      "C": "My mind speeds up with each round until I'm stuck in a loop and can't act at all.",
      "D": "I engage at first, then get quieter, then go very still. By the end I've stopped participating.",
      "E": "The charge builds each round until something snaps or I explode or collapse.",
      "F": "I'm present at first, then start drifting, and by the end I'm watching from far away."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 45,
    "category": "att",
    "axis": "4,2",
    "load": "high",
    "ic": "Y",
    "scenarioTag": "alone_with_it",
    "text": "You're going through something painful and there's nobody to turn to — or nobody who would understand. What happens in you first?",
    "options": {
      "A": "I try to be with myself through it, even though it's hard alone.",
      "B": "I look for something to do — distraction, productivity, anything that keeps me moving.",
      "C": "My mind starts looping: why am I alone in this, what did I do to end up here.",
      "D": "I sink. The aloneness and the pain merge into something very heavy.",
      "E": "The pain is sharp and the aloneness amplifies it — it's visceral.",
      "F": "I go somewhere else inside. The pain is there but I'm not fully in it."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 46,
    "category": "ifs",
    "axis": "5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "exhausted_keep_pushing",
    "text": "You're already running on empty but something demands more from you. What happens in you first?",
    "options": {
      "A": "I check in with myself honestly about what I actually have left.",
      "B": "I push through. I find another gear and keep going.",
      "C": "My mind splits — one part knows I need to stop, another part won't let me.",
      "D": "I collapse a little. The demand on top of the exhaustion flattens me.",
      "E": "There's a surge of resentment or desperation — something sharp before I comply or refuse.",
      "F": "I go into autopilot. My body keeps moving but I'm not really driving."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 47,
    "category": "ifs",
    "axis": "1,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "someone_needs_you_depleted",
    "text": "Someone you care about needs you but you're already depleted. What happens in you first?",
    "options": {
      "A": "I'm honest about my capacity and try to show up in a way that doesn't break me.",
      "B": "I override my exhaustion and show up for them. Their need comes first.",
      "C": "I feel torn — guilt about my limits fighting against resentment about the demand.",
      "D": "I withdraw. I can't give what I don't have and I stop pretending I can.",
      "E": "Something flares — resentment, or the intensity of being needed when I'm empty.",
      "F": "I go numb. My body is present but I'm barely in it."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 48,
    "category": "ifs",
    "axis": "2,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "letting_someone_go",
    "text": "You know a relationship needs to end or change, but you haven't fully let go yet. When you sit with that, what happens first?",
    "options": {
      "A": "I try to be honest with myself about where things actually stand.",
      "B": "I start planning — how to do this cleanly, how to manage the transition.",
      "C": "I go back and forth: maybe it can work, maybe it can't, maybe I'm wrong.",
      "D": "I feel heavy. The letting-go part has already started even though I haven't acted.",
      "E": "Waves of feeling come — grief, urgency, love, anger — sometimes all at once.",
      "F": "I feel removed from it. Like the relationship is already at a distance."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 49,
    "category": "agency",
    "axis": "5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "stuck_cant_start",
    "text": "There's something you need to do that matters, but you can't seem to start. What's happening in you?",
    "options": {
      "A": "I recognize I'm stuck and try to find the smallest possible first step.",
      "B": "I organize around it — lists, plans, clearing the deck — anything but the thing itself.",
      "C": "I'm caught in analysis: what's the right approach, what if I do it wrong.",
      "D": "I feel flat. The motivation isn't there and I can't manufacture it.",
      "E": "There's an urgency to start but it's fighting something equally strong that won't let me.",
      "F": "I drift. The task exists in my awareness but I keep ending up somewhere else."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 50,
    "category": "agency",
    "axis": "5,1",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "boundary_need_to_set",
    "text": "You know you need to set a boundary but haven't yet. What's keeping you from it?",
    "options": {
      "A": "I'm waiting for the right moment but I know I'll do it.",
      "B": "I'm managing around it — handling the situation without directly naming the boundary.",
      "C": "I'm stuck calculating: what will happen if I set it, what will happen if I don't.",
      "D": "I don't have the energy. The boundary feels like it would cost more than the violation.",
      "E": "There's a tension — the need to set it is real but so is the fear of what comes next.",
      "F": "I keep forgetting about it. The need surfaces and then disappears again."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 51,
    "category": "agency",
    "axis": "5",
    "load": "high",
    "ic": "",
    "scenarioTag": "shutdown_after_trying",
    "text": "You've been trying hard at something and it's not working. You've hit a wall. What happens in you first?",
    "options": {
      "A": "I step back to reassess rather than pushing harder into something that isn't working.",
      "B": "I try a different approach. If this way doesn't work, there must be another.",
      "C": "My mind won't let go — it keeps trying to solve it, running the same loops.",
      "D": "I give up. Not dramatically — I just go quiet and stop trying.",
      "E": "Frustration surges. The wall feels personal.",
      "F": "I detach. The effort and the outcome both start to feel distant."
    },
    "bodyPrompt": "enhanced"
  },
  {
    "num": 52,
    "category": "agency",
    "axis": "5,2",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "hope_dying",
    "text": "Something you'd been hopeful about isn't going to happen. The hope is dying. What happens in you first?",
    "options": {
      "A": "I try to grieve it honestly rather than minimizing or inflating it.",
      "B": "I immediately start looking for what's next — another plan, another route.",
      "C": "My mind starts processing: could I have done more? Was the hope realistic?",
      "D": "I go quiet. Something collapses and I let it.",
      "E": "The loss of hope hits with surprising force — sharper than I expected.",
      "F": "I feel oddly neutral. Like the hope leaving didn't fully register."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 53,
    "category": "ifs",
    "axis": "2,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "protector_steps_aside",
    "text": "For a brief moment, the part of you that usually manages or guards just stops. The effort drops and you're left with whatever is underneath. What's there?",
    "options": {
      "A": "Quiet presence. I feel like myself without the effort.",
      "B": "Discomfort. Without the managing, I don't know what to do with the moment.",
      "C": "My mind scrambles to analyze what just happened and whether it's safe to stay here.",
      "D": "Sadness or heaviness. Like the guard was holding something back and now it's settling in.",
      "E": "A rush of feeling — whatever was being managed hits all at once.",
      "F": "Nothing. When the guard drops, what's underneath is just blank."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 54,
    "category": "state",
    "axis": "3,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "performing_fine",
    "text": "People around you think you're doing well but inside you feel nothing — just performing 'fine.' What happens in you first?",
    "options": {
      "A": "I notice the gap between outside and inside and decide whether to close it.",
      "B": "I keep performing. The show must go on.",
      "C": "I start analyzing the disconnect: why can't I feel anything? What's wrong?",
      "D": "I sink into the emptiness. The performance takes what little energy I had.",
      "E": "There's a flash of something underneath — anger or sadness about the performance itself.",
      "F": "I stay in the blankness. Performing and feeling nothing become the same state."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 55,
    "category": "state",
    "axis": "5,3",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "numbing_on_purpose",
    "text": "You notice yourself doing something to numb out — scrolling, drinking, overworking. What happens when you notice?",
    "options": {
      "A": "I try to pause and check what I'm avoiding.",
      "B": "I let myself have it — I'll deal with the feelings later.",
      "C": "I start analyzing the pattern: why am I doing this, what am I running from.",
      "D": "I don't really care. The numbing is doing its job and I let it.",
      "E": "There's a spike of shame or frustration about the pattern itself.",
      "F": "I notice but it doesn't change anything. I keep going, aware but not engaged."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 56,
    "category": "ifs",
    "axis": "4,5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "honesty_over_protection",
    "text": "You're in a situation where you could say the safe thing or the true thing. The true thing might create discomfort. What happens as you decide?",
    "options": {
      "A": "I lean toward the true thing. The discomfort of honesty feels more manageable than hiding.",
      "B": "I find a way to say something true-ish that doesn't land too hard.",
      "C": "I get caught calculating: what's the cost of each path?",
      "D": "I stay quiet. The true thing stays inside because the risk doesn't feel worth it.",
      "E": "The true thing pushes to come out with force — almost involuntary.",
      "F": "By the time I've decided, the moment has passed."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 57,
    "category": "state",
    "axis": "3,5",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "coming_back_after_shutdown",
    "text": "After you've shut down or checked out — hours or days later — what does coming back online feel like?",
    "options": {
      "A": "Clarity comes back first. I start seeing the situation more clearly.",
      "B": "The urge to fix things comes first. I start catching up, making plans.",
      "C": "Thinking comes back first — replaying what happened, worrying about the gap.",
      "D": "It's slow. Energy comes back in thin layers. I'm functional before I'm actually present.",
      "E": "Feeling comes back first — sometimes as a delayed wave of whatever I was avoiding.",
      "F": "It's patchy. Parts of me come back while other parts stay distant."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 58,
    "category": "att",
    "axis": "4",
    "load": "moderate",
    "ic": "Y",
    "scenarioTag": "initiation_goes_well_b",
    "text": "You take a small risk in a relationship — saying something honest or showing up differently — and it's received well. Over the next few days, what happens to that experience inside you?",
    "options": {
      "A": "It settles in and builds quiet confidence. The risk was worth it.",
      "B": "I start planning more moves like it — how to keep this momentum going.",
      "C": "I replay it, looking for signs I'm reading the positive response wrong.",
      "D": "It fades faster than I expected. The good feeling doesn't stick.",
      "E": "The positive experience carries emotional weight — it meant a lot and I keep feeling it.",
      "F": "I remember it happened but the feeling of it becomes hard to access pretty quickly."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 59,
    "category": "ifs",
    "axis": "2,4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "letting_someone_go_b",
    "text": "Someone who once mattered deeply to you is no longer in your life. Not because of a fight — just time, distance, change. When you think of them, what happens?",
    "options": {
      "A": "I feel a quiet warmth. The connection mattered even though it changed.",
      "B": "I focus on what I learned from it and move forward.",
      "C": "I get caught in wondering what happened and whether I could have kept it.",
      "D": "Something aches. The absence is heavy and I let myself feel it.",
      "E": "The feeling is surprisingly intense — the missing hits harder than I thought it would.",
      "F": "I think about it but the feeling is muted. Like the memory is behind a pane of glass."
    },
    "bodyPrompt": "standard"
  },
  {
    "num": 60,
    "category": "ifs",
    "axis": "4",
    "load": "moderate",
    "ic": "",
    "scenarioTag": "what_safety_feels_like",
    "text": "Think of the safest you've ever felt with another person. Not just physically safe — emotionally safe. What was that like in your body and in your system?",
    "options": {
      "A": "Warm, settled, present. My body was quiet and I didn't need to monitor anything.",
      "B": "I'm not sure I've fully had that. There's always been at least a small part of me on watch.",
      "C": "I can think of moments but my mind quickly starts qualifying them — were they really safe?",
      "D": "I have a hard time accessing that feeling. Safety with someone feels abstract.",
      "E": "When I've had it, it was almost overwhelming — the relief of not having to protect myself was intense.",
      "F": "I can picture what it might look like but I can't really feel it from inside."
    },
    "bodyPrompt": "standard"
  }
] as const satisfies QuestionRow[];

export const QUESTIONS: QuestionData[] = QUESTION_ROWS.map((question) => ({
  ...question,
  supportsImpulse: question.bodyPrompt === "enhanced",
}));
