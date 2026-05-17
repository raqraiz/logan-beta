// Centralized postpartum phase model. Used by HomeTab, PlanTab, and the cycle circle
// so insights, diet, exercise, and mood/hormone context stay consistent across the app.

export type PPPhase =
  | "acute"      // 0-2 weeks
  | "early"      // 2-6 weeks
  | "healing"    // 6-12 weeks
  | "rebuilding" // 3-6 months
  | "late"       // 6-12 months
  | "extended";  // 12+ months

export interface PPPhaseMeta {
  phase: PPPhase;
  label: string;
  shortLabel: string;
  rangeLabel: string;
  hormones: string;       // what's happening hormonally
  mood: string;           // expected mood/cognitive landscape
}

export function getPostpartumPhase(birthDate?: string | null): PPPhase {
  if (!birthDate) return "acute";
  const start = new Date(birthDate + "T12:00:00Z");
  const days = Math.floor((Date.now() - start.getTime()) / 86400000);
  if (days < 14) return "acute";
  if (days < 42) return "early";
  if (days < 84) return "healing";
  if (days < 180) return "rebuilding";
  if (days < 365) return "late";
  return "extended";
}

export function getPostpartumDays(birthDate?: string | null): number {
  if (!birthDate) return 0;
  const start = new Date(birthDate + "T12:00:00Z");
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

export const PP_META: Record<PPPhase, PPPhaseMeta> = {
  acute: {
    phase: "acute",
    label: "Acute recovery (0-2 weeks)",
    shortLabel: "Acute recovery",
    rangeLabel: "0-2 weeks",
    hormones: "Estrogen and progesterone just crashed harder than at any other point in your life. Prolactin and oxytocin are surging. Cortisol is elevated from sleep loss.",
    mood: "Weepiness, euphoria, fear, and flatness can all show up in the same hour. This is hormonal whiplash — not personality.",
  },
  early: {
    phase: "early",
    label: "Early recovery (2-6 weeks)",
    shortLabel: "Early recovery",
    rangeLabel: "2-6 weeks",
    hormones: "Hormones still finding the floor. Prolactin high (especially if nursing). Thyroid can swing — postpartum thyroiditis often shows up in this window.",
    mood: "Baby blues should ease around week 2-3. Persistent low mood, intrusive thoughts, or rage past two weeks = PPD/PPA territory. Real, treatable, common.",
  },
  healing: {
    phase: "healing",
    label: "Tissue closing (6-12 weeks)",
    shortLabel: "Tissue closing",
    rangeLabel: "6-12 weeks",
    hormones: "Estrogen still suppressed (especially if breastfeeding). Sleep debt is at its peak. Cortisol patterns dysregulated.",
    mood: "Identity shock often peaks here — 'who am I now?' Cognitive fog is real. This is not your new baseline; it's a snapshot.",
  },
  rebuilding: {
    phase: "rebuilding",
    label: "Rebuilding (3-6 months)",
    shortLabel: "Rebuilding",
    rangeLabel: "3-6 months",
    hormones: "Hair shedding peaks (estrogen drop catching up). Some women's cycles return — others don't yet, especially if exclusively nursing.",
    mood: "Capacity slowly comes back. Libido may start re-emerging. Mood swings can mirror returning ovulation even before the first period shows.",
  },
  late: {
    phase: "late",
    label: "Reclaiming capacity (6-12 months)",
    shortLabel: "Reclaiming capacity",
    rangeLabel: "6-12 months",
    hormones: "Cycle often returns in this window (sooner if not nursing). Thyroid worth re-checking around 6-9 months. Estrogen normalizing.",
    mood: "You're not in 'recovery' anymore — you're an adult-with-a-baby. Treat lingering symptoms as data, not destiny.",
  },
  extended: {
    phase: "extended",
    label: "Extended postpartum (12+ months)",
    shortLabel: "Extended postpartum",
    rangeLabel: "12+ months",
    hormones: "Hormones largely recalibrated. Cycle has typically returned. Symptoms now usually trace to cycle, sleep, thyroid, or stress — not 'postpartum'.",
    mood: "Treat yourself like the full athletic adult you are. Parental burnout is real, but it's not the same as postpartum recovery.",
  },
};

// ── Workout per phase ──────────────────────────────────────
export const PP_WORKOUTS: Record<PPPhase, { suggestion: string; examples: string[]; trainingNote: string }> = {
  acute: {
    suggestion: "Your only job is to heal. Breath, gentle pelvic floor reconnection, and short slow walks once you feel up to it.",
    examples: ["Diaphragmatic breathing", "Pelvic floor activations", "Ankle pumps", "Slow indoor walking"],
    trainingNote: "No lifting heavier than the baby. Heavier bleeding or pelvic pressure = stop and rest. Six-week clearance is a minimum, not a green light.",
  },
  early: {
    suggestion: "Reconnect breath to pelvic floor and core. Add a daily walk if you feel ready. Skip anything that creates pelvic heaviness.",
    examples: ["360° breathing", "Glute squeezes", "Wall pushes", "10-15 min walks", "Gentle stretching"],
    trainingNote: "If bleeding restarts brighter, leaks happen, or anything feels 'heavy' down there — back off. A pelvic floor PT visit around 6 weeks pays off long-term.",
  },
  healing: {
    suggestion: "Rebuild the foundation: glutes, deep core, posture, low-load strength. Consistency beats intensity.",
    examples: ["Bodyweight squats", "Glute bridges", "Dead bugs", "Bird dogs", "Postnatal Pilates"],
    trainingNote: "Watch for coning/doming in the abs, leaking, or pelvic heaviness. Any of those = scale back and see a pelvic floor PT.",
  },
  rebuilding: {
    suggestion: "Add load gradually. Start strength training with light dumbbells, slow tempo, and full breath control. Light cardio is fine.",
    examples: ["Goblet squats", "Romanian deadlifts (light)", "Rows", "Stroller intervals", "Yoga flows"],
    trainingNote: "Progressive overload is back on the table — slowly. Sleep and fueling determine recovery more than the program does right now.",
  },
  late: {
    suggestion: "Build strength with clear progression — real resistance, measured intensity, and pelvic-floor-aware impact if symptoms are quiet.",
    examples: ["Heavy compound lifts", "Running / intervals", "Plyometrics", "Sport-specific training"],
    trainingNote: "You are not fragile. Lingering symptoms (leaking, prolapse feel, diastasis) deserve a specialist — not permanent backing-off.",
  },
  extended: {
    suggestion: "Train for performance and longevity. Bone density, VO2 max, and strength are your highest-leverage levers now.",
    examples: ["Heavy strength blocks", "Zone 2 + intervals", "Skill work / sport", "Mobility maintenance"],
    trainingNote: "Symptoms past 12 months usually aren't 'postpartum' anymore — investigate cycle, thyroid, sleep, and stress instead of assuming.",
  },
};

// ── Nutrition per phase ────────────────────────────────────
export const PP_NUTRITIONS: Record<PPPhase, { focus: string; foods: string[]; avoid: string }> = {
  acute: {
    focus: "Replenish iron and blood volume, heal tissue, stabilize blood sugar between feeds",
    foods: [
      "Iron + vitamin C together (steak with peppers, lentils with citrus)",
      "Bone broth, soups, slow-cooked meats",
      "Healthy fats every meal (avocado, eggs, olive oil)",
      "Water beside every feeding spot — aim 3L+/day if nursing",
    ],
    avoid: "Cold raw salads as a main meal, restrictive diets, skipping meals because you're 'not hungry'. Postpartum hunger cues are unreliable.",
  },
  early: {
    focus: "Steady blood sugar through erratic sleep, support tissue healing, protect milk supply if nursing",
    foods: [
      "Protein at every meal (25-30g+)",
      "Complex carbs at every meal — oats, rice, sweet potato",
      "Omega-3s 3-4x/week (salmon, sardines, walnuts)",
      "Easy snacks within arm's reach: nuts, cheese, fruit, yogurt",
    ],
    avoid: "Caffeine after noon if nursing or wired-tired, ultra-low-carb experiments, and anything labelled 'postpartum cleanse'.",
  },
  healing: {
    focus: "Rebuild muscle, support hair root anchoring, steady mood through hormone shifts",
    foods: [
      "Protein 1.2-1.6g/kg bodyweight",
      "Iron-rich foods 3-4x/week (still rebuilding stores)",
      "Choline (eggs, liver) for brain recovery",
      "Magnesium-rich foods at night (pumpkin seeds, dark chocolate, leafy greens)",
    ],
    avoid: "Underfueling because the scale is sticky — under-eating now drives hair shedding, fatigue, and mood crashes.",
  },
  rebuilding: {
    focus: "Support hair regrowth, steady mood, and restoring training capacity",
    foods: [
      "Protein 1.4-1.8g/kg bodyweight",
      "Carbs around training, not feared",
      "Cruciferous veg most days (estrogen metabolism kicking back in)",
      "Healthy fats for hormone production (olive oil, nuts, full-fat dairy)",
    ],
    avoid: "Aggressive deficits. The biggest cause of stalled recovery at this stage is chronic under-eating dressed up as 'getting back'.",
  },
  late: {
    focus: "Athletic recovery, hormone re-regulation, supporting return-of-cycle if it's back",
    foods: [
      "High protein (1.6-2g/kg)",
      "Iron + B12 if cycle has returned",
      "Carbs matched to training load",
      "Magnesium and omega-3s for cycle symptoms",
    ],
    avoid: "Treating yourself like you're still in 'recovery mode' food-wise if you're training hard — that's how you stall and crash.",
  },
  extended: {
    focus: "Performance, longevity, and (if cycling) phase-aware fueling",
    foods: [
      "Protein 1.6-2g/kg",
      "Phase-aware carbs if cycling again",
      "Bone-supportive nutrients (calcium, vit D, K2)",
      "Plenty of fiber and fermented foods",
    ],
    avoid: "Defaulting to 'postpartum' as the explanation for fatigue or low mood. After 12 months, look at iron, thyroid, sleep, and stress first.",
  },
};

// ── Mood / hormonal shift guide per phase ───────────────────
export const PP_MOODS: Record<PPPhase, {
  outlook: string;
  hormonalShift: string;
  headsUp: string;
  selfCare: string;
  relationships: { people: string; withPartner: string; withKids: string; strategy: string };
}> = {
  acute: {
    outlook: "Survival mode — that is the assignment",
    hormonalShift: "Estrogen and progesterone have crashed off a cliff. Oxytocin and prolactin are running the show. Your nervous system is genuinely altered.",
    headsUp: "Crying at nothing, racing thoughts, fear about the baby — extremely common. Past 2 weeks of low mood or any intrusive thoughts about harm = call your provider today.",
    selfCare: "Sleep when the baby sleeps. One warm meal, 5 minutes of daylight, one shower. That is a complete successful day.",
    relationships: {
      people: "Tell ONE person the truth about how you're doing. Pretending you're fine is the fastest way to spiral.",
      withPartner: "Be brutally specific: 'Take the 2am feed,' not 'help more.' Their brain can't read yours right now either.",
      withKids: "Older kids feel the shift hardest. One short consistent ritual (one book, one song) reassures them more than perfection.",
      strategy: "This is the hardest hormonal window of your life. You don't have to optimize it — you just have to get through it.",
    },
  },
  early: {
    outlook: "The fog is starting — barely",
    hormonalShift: "Hormones still searching for a baseline. Thyroid can swing in this window, which can mimic mood disorder symptoms.",
    headsUp: "Baby blues should be lifting by week 3. If they aren't — or you feel rage, dread, or numbness — please name it to a clinician. PPD/PPA is treatable and you deserve treatment.",
    selfCare: "Two non-negotiables a day: protein-rich meal + sunlight. Everything else is bonus.",
    relationships: {
      people: "Let one person bring food without negotiating. Accepting help builds the village you'll need at 4 months too.",
      withPartner: "If they're back at work, schedule a 10-minute end-of-day check-in. Otherwise the resentment compounds invisibly.",
      withKids: "Lower the bar on screen time and treats. Survival now buys you better parenting later.",
      strategy: "If the baby blues haven't lifted by week 3, that's your cue to act, not wait it out.",
    },
  },
  healing: {
    outlook: "Tissue closing, identity opening up",
    hormonalShift: "Estrogen often still suppressed (especially nursing). Cortisol pattern is scrambled by interrupted sleep. Cognitive fog peaks here.",
    headsUp: "Identity shock often peaks around 8-10 weeks — the 'who am I now?' wave. This is real but not permanent. Name it before it names you.",
    selfCare: "Reclaim 20 minutes of solo time daily — a shower, a walk, a coffee outside. It's not optional, it's regulation.",
    relationships: {
      people: "Re-engage one friendship — even a 10-minute voice memo. Isolation is the silent postpartum killer.",
      withPartner: "Audit the invisible load this week. Pick ONE thing they own start to finish — not 'help with'.",
      withKids: "Predictable rhythms beat perfect activities. Boring + consistent wins right now.",
      strategy: "Cognitive fog is a hormonal/sleep symptom, not a permanent IQ change. It comes back.",
    },
  },
  rebuilding: {
    outlook: "Capacity returning, one rep at a time",
    hormonalShift: "Hair shedding often peaks now (the estrogen drop catching up). Cycle may return — or hormones may mimic ovulation before any period shows.",
    headsUp: "Mood swings that seem 'PMS-like' even without a period are real — your hormones are speaking before they're cycling. Track them.",
    selfCare: "One solo block per week — 60-90 minutes that's just yours. It's not luxury, it's how you stay you.",
    relationships: {
      people: "Reconnect with one piece of your pre-baby life that mattered. A hobby, a friend group, a class.",
      withPartner: "Renegotiate the night shift now that the early window has closed. 'It worked for then' doesn't mean now.",
      withKids: "Model rest openly — 'mom is taking 30 minutes' teaches them more than another activity does.",
      strategy: "You're not behind. You're rebuilding from the inside out — capacity returns faster than you think.",
    },
  },
  late: {
    outlook: "Reclaiming yourself",
    hormonalShift: "Cycle often returns in this window (later if exclusively nursing). Thyroid is worth re-checking around 6-9 months — postpartum thyroiditis is missed constantly.",
    headsUp: "If your cycle is back, expect symptoms to feel louder than before — your body is recalibrating. Track them like real data, not noise.",
    selfCare: "Treat yourself like the person you were becoming before all this. Big goals are allowed.",
    relationships: {
      people: "Reconnect with the parts of your life that aren't about the baby. Friendships, work, hobbies — they're allowed to matter.",
      withPartner: "Renegotiate the load now that the early window has closed. 'It worked for then' doesn't mean it works now.",
      withKids: "Model ambition and self-care openly. They learn what a full life looks like by watching yours.",
      strategy: "You're not 'getting back to normal' — you're building a new normal that includes more of you, not less.",
    },
  },
  extended: {
    outlook: "You're not recovering — you're living",
    hormonalShift: "Hormones are largely recalibrated. Most symptoms now trace back to cycle, sleep, thyroid, or stress — not postpartum itself.",
    headsUp: "If you still feel 'wrecked', stop blaming postpartum. Push for full bloodwork: iron, ferritin, thyroid panel, vitamin D, B12.",
    selfCare: "Plan something just for you each month — solo trip, big workout block, a class. The compound effect is enormous.",
    relationships: {
      people: "Mentor a newer mom. You know things now that would have saved you months back then.",
      withPartner: "Set a recurring monthly conversation about ambitions and load — both of yours. Don't let it become muscle memory imbalance.",
      withKids: "They're watching whether your life expanded or shrunk. Show them expansion.",
      strategy: "Postpartum stops being the explanation around now. Investigate everything else first.",
    },
  },
};

// ── Tip lists for HomeTab cards ─────────────────────────────
export const PP_SUCCEED_HER: Record<PPPhase, string[]> = {
  acute: [
    "Sleep when the baby sleeps — even 20 minutes counts. This is healing, not laziness.",
    "Eat one warm, protein-rich meal a day. Bone broth, eggs, oats — anything cooked.",
    "Step outside for 5 minutes of daylight. It resets your hormones and mood.",
    "Let one person help today. Texting a friend 'can you bring food?' is a win.",
    "Do nothing performative. Survival is the goal — anything else is bonus.",
  ],
  early: [
    "Add a 5-minute outdoor walk daily. Sunlight + slow movement is real medicine right now.",
    "Eat protein within an hour of waking. It anchors blood sugar through the day.",
    "Name how you actually feel to one person today. Not 'fine'. Real words.",
    "Lay out tomorrow's snacks tonight. Future-you running on no sleep will thank you.",
    "If baby blues haven't lifted by week 3, call your provider. Don't 'wait and see'.",
  ],
  healing: [
    "Add gentle strength work — bodyweight squats, glute bridges, breathwork.",
    "Reclaim 20 minutes for yourself daily. A shower, a book, anything that's just yours.",
    "Eat protein + complex carbs at every meal. Hair, muscle, and mood all need it.",
    "Schedule a friend visit or video call this week. Isolation compounds fast.",
    "Book the pelvic floor PT consult if you haven't. It pays back forever.",
  ],
  rebuilding: [
    "Add load to your strength work — light dumbbells, slow tempo, full breath.",
    "Track your mood weekly. Returning hormones often whisper before they shout.",
    "Eat carbs around your workouts — fearing them stalls everything.",
    "Reconnect with one pre-baby identity piece. A class, a friend group, a hobby.",
    "Take one full solo hour this week. Non-negotiable.",
  ],
  late: [
    "Build strength with intention — progressive overload, real resistance, and recovery that matches your actual sleep.",
    "Re-check thyroid if you feel off. Postpartum thyroiditis is missed constantly around 6-9 months.",
    "Set a goal that has nothing to do with motherhood. A race, a class, a project.",
    "If your cycle is back, treat symptoms as data, not noise.",
    "Plan something just for you this month — solo trip, big workout, deep work day.",
  ],
  extended: [
    "Train for performance and longevity — bone density and VO2 max are the levers.",
    "If you still feel wrecked, push for full bloodwork. Don't blame postpartum anymore.",
    "Mentor a newer mom. You know things that would have saved you months.",
    "Negotiate the load openly. 'It worked back then' isn't a reason to keep doing it.",
    "Plan something monthly that's just yours. The compound effect is huge.",
  ],
};

export const PP_DONTMESS_HER: Record<PPPhase, string[]> = {
  acute: [
    "Don't try to 'bounce back' anything. Your body just built and birthed a human.",
    "Don't restrict food. Your body needs fuel to heal and (if nursing) feed.",
    "Don't compare your recovery to anyone on the internet. The highlight reel isn't real.",
    "Don't ignore intrusive thoughts or unrelenting low mood — call your provider today, not next week.",
    "Don't make big life decisions right now. Sleep deprivation isn't a strategist.",
  ],
  early: [
    "Don't assume baby blues will keep lifting on their own past 2-3 weeks. If they don't, act.",
    "Don't skip food because you 'forgot' — set timers if you need to.",
    "Don't push exercise yet. Wait for the 6-week clearance, then start very small.",
    "Don't host visitors who don't help. Their needs are not yours to manage right now.",
    "Don't shrink the symptom story when you talk to your provider. Say the worst version.",
  ],
  healing: [
    "Don't add intensity faster than your pelvic floor allows. Leaking or heaviness = back off.",
    "Don't skip protein because you're 'too busy'. Hair loss and fatigue compound when you do.",
    "Don't treat cognitive fog as your new IQ. It's hormonal + sleep — it lifts.",
    "Don't bury the mood stuff. If you still feel underwater at 3 months, that's worth a check-in.",
    "Don't say yes to everything just to feel normal. Capacity is still rebuilding.",
  ],
  rebuilding: [
    "Don't fear carbs. Under-eating around training right now stalls recovery and crashes mood.",
    "Don't dismiss 'PMS-like' moods even without a period. Your hormones are talking.",
    "Don't compare your timeline to other moms. Bodies and babies wildly differ.",
    "Don't push hair shedding panic. It peaks now and resolves — fueling helps more than supplements.",
    "Don't skip the pelvic floor PT if anything still feels off. This is the window to fix it.",
  ],
  late: [
    "Don't keep treating yourself like you're fragile if you're not. You can train hard now.",
    "Don't write off symptoms as 'just postpartum' — push for thyroid and iron labs.",
    "Don't skip strength work. Bone density and metabolic health depend on it.",
    "Don't lose yourself in the parent identity. The other parts of you still need attention.",
    "Don't ignore returning cycle symptoms — your hormones are speaking again, listen.",
  ],
  extended: [
    "Don't blame postpartum for everything anymore. After 12 months, look elsewhere first.",
    "Don't accept 'tired is normal' as the answer. Get the bloodwork.",
    "Don't keep absorbing the load by default. Renegotiate.",
    "Don't drop strength training. The next 10 years depend on it.",
    "Don't skip mood check-ins. Parental burnout is real and treatable.",
  ],
};

export const PP_SUCCEED_HIM: Record<PPPhase, string[]> = {
  acute: [
    "Take a night feed without being asked. One unbroken sleep cycle changes her week.",
    "Bring food without commentary. Hot, salty, easy to eat one-handed wins.",
    "Handle one chore she'd normally do — laundry, dishes, the dog. Just one, fully.",
    "Tell her she's doing an amazing job. She doesn't believe it yet — say it anyway.",
    "Protect her sleep window like it's sacred. Field visitors, calls, everything.",
  ],
  early: [
    "Watch for baby blues NOT lifting by week 3 — and gently say something if it doesn't.",
    "Take the morning shift one weekend day so she gets a full sleep cycle.",
    "Do the dishes before they pile. Visible mess is invisible weight on her.",
    "Restock snacks she can eat one-handed. Nuts, cheese, jerky, fruit.",
    "Say her name in a non-baby context daily. She's still herself.",
  ],
  healing: [
    "Give her a 60-90 minute solo block this week. Walk, gym, coffee — whatever she picks.",
    "Notice the invisible work and pick one thing up permanently. Bottles, daycare bag, doctor visits.",
    "Plan a date — even at home after bedtime. She needs to be a person, not just a parent.",
    "Compliment something specific that isn't her body. Patience, ideas, how she handles hard moments.",
    "Ask 'what would actually help this week?' and then do it without follow-up questions.",
  ],
  rebuilding: [
    "Back her workouts. Drive her to the class. Hold the baby while she lifts.",
    "Notice when she's tracking moods or symptoms — take it seriously, ask one good question.",
    "Plan a real date night out. Get the sitter, make the reservation. Don't outsource the planning.",
    "Defend her solo block from your own week. It's not optional.",
    "Stop saying 'just tell me what to do' — look around and do something.",
  ],
  late: [
    "Match her ambition again — back her workouts, her work goals, her solo time.",
    "Stop asking if she's 'okay to' do hard things. She is. Trust her body.",
    "Plan something big together — a trip, a goal, a project. Reconnect as partners.",
    "Carry your half of the mental load permanently. Schedules, school, social — own a real chunk.",
    "Notice how much she's done. Say it out loud. She's been keeping score even if you haven't.",
  ],
  extended: [
    "Don't keep using 'she just had a baby' as an excuse for uneven load. That window closed.",
    "Cheer for her getting strong, ambitious, and social again — don't be threatened by it.",
    "Schedule date night like a meeting. Don't let it die.",
    "Ask about her ambitions monthly, like you'd want her to ask about yours.",
    "Carry the mental load on at least one entire domain — schedules, school, finances, social.",
  ],
};

export const PP_DONTMESS_HIM: Record<PPPhase, string[]> = {
  acute: [
    "Don't comment on her body — not size, not weight, not 'when you're back'. Don't.",
    "Don't ask 'what can I do?' — look around and just do it.",
    "Don't disappear into work. Showing up at home is the assignment right now.",
    "Don't minimize her exhaustion or pain. It's worse than you can imagine.",
    "Don't take her irritability personally. She's running on broken sleep and hormone whiplash.",
  ],
  early: [
    "Don't say 'sleep when the baby sleeps'. It's not actionable. Take the baby instead.",
    "Don't tell her she 'seems better' as a way to reduce your effort.",
    "Don't host your own friends without 100% planning the cleanup.",
    "Don't compare her to other moms — yours, his, Instagram's, anyone.",
    "Don't dismiss anything she names about her body or mood. Believe her the first time.",
  ],
  healing: [
    "Don't assume she's 'back to normal' just because the baby sleeps better. She's not.",
    "Don't keep score on chores. Whoever sees it, does it.",
    "Don't push for sex or intimacy on your timeline. Closeness rebuilds in many ways.",
    "Don't joke about 'mom brain'. Cognitive fog is real and she's already self-conscious.",
    "Don't forget she's still a person with her own ambitions. Ask about them.",
  ],
  rebuilding: [
    "Don't roll your eyes at the new workouts, supplements, or solo time. They're not for fun — they're how she comes back.",
    "Don't plan family time over her training time without checking first.",
    "Don't joke about the hair shedding, mood swings, or returning libido (or lack of it).",
    "Don't assume the load you took on temporarily can drop now. Some of it is permanent.",
    "Don't make her ask twice for the same kind of help.",
  ],
  late: [
    "Don't keep using 'she just had a baby' as an excuse for uneven load. That window closed.",
    "Don't be threatened by her getting strong, ambitious, or social again. Cheer for it.",
    "Don't let date night die. Schedule it like a meeting.",
    "Don't dismiss returning cycle symptoms. Her hormones are loud again — believe her.",
    "Don't assume anything about her body or capacity. Ask, listen, adjust.",
  ],
  extended: [
    "Don't keep blaming 'postpartum' for things that are now load, sleep, or thyroid.",
    "Don't quietly let the load tilt back to her. Audit it together every quarter.",
    "Don't assume sex/intimacy patterns from year one are the new normal. Re-open the conversation.",
    "Don't dismiss her ambitions as a 'phase'. Bet on her like she bets on you.",
    "Don't stop saying out loud what she's done. The receipts matter.",
  ],
};

// Convenience: phase → display label
export function getPPPhaseLabel(birthDate?: string | null): string {
  return PP_META[getPostpartumPhase(birthDate)].label;
}
