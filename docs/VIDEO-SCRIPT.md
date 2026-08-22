# Termsheet — 3 minute demo script

Written to be **spoken**, not read. Short sentences, contractions, one idea at
a time. Say it your way — if a line feels stiff in your mouth, change it.

**Total: ~2:50.** Leaves room to breathe.

Before recording: `npm run n8n:up`, then `npm run web:dev`, and do one
throwaway upload to warm everything up. Have the five demo PDFs in a folder
you can drag from in one motion.

---

## 0:00 – 0:25 · The problem

> **[Screen: a real syllabus PDF, scrolling slowly]**

"This is a syllabus. Somewhere in here — usually between the academic
integrity policy and the office hours — is a list of things I have to buy.

A hundred and eighty-five dollars for the textbook. Eighty-nine for the access
code I need to submit homework. Forty-two for a calculator the midterm
requires.

I got five of these in September. Nobody adds them up. You find out one
surprise at a time, in the bookstore line, in the first week, when you have
the least money you'll have all year."

> **[Beat. Stop scrolling.]**

"A syllabus is a bill nobody itemizes."

---

## 0:25 – 0:45 · What it is

> **[Screen: Termsheet landing page]**

"So we built Termsheet.

You drop in your syllabi — up to five, a full course load — and it tells you
two things. When everything's due. And what the term actually costs."

> **[Drag all five PDFs in at once. Let the queue appear.]**

"All five at once, in parallel. About twenty seconds."

---

## 0:45 – 1:15 · The timeline

> **[Screen: results — the term spine]**

"Here's the term, end to end.

Deadlines above the line. Money below it. So you can read straight down from a
busy week and see what that same week costs you."

> **[Click a deadline tick — detail panel opens]**

"Every item is clickable, and every one carries the exact line from the
syllabus it came from. Because if it can't quote the source, it doesn't put it
on your calendar."

> **[Click a cost bar]**

"Same for the money. That's a hundred and eighty-four ninety-five, and there's
the sentence in the syllabus that says so."

---

## 1:15 – 1:45 · The stuff one syllabus can't tell you

> **[Scroll to crunch weeks]**

"Now here's the part you can't get from any single syllabus.

The week of October nineteenth, three of my five courses all want something.
That's fourteen percent of everything I'm graded on this term, in four days.

And that's not just a bad week academically. That's a week I spend more and
work fewer shifts."

> **[Scroll to per-course breakdown, point at the duplicate]**

"It also caught this. Two of my courses require the same clicker subscription.
One subscription covers both — so it's counted once. A tool that just adds
things up gives you a number that's wrong by thirty-five dollars, and never
tells you."

> **[Point at the free course]**

"And this course costs nothing. It's genuinely free — open textbook, no
clicker. Getting that right matters more than it sounds. That's exactly where
a weaker tool would invent a price."

---

## 1:45 – 2:20 · The money

> **[Scroll to financial aid, enter OSAP + tuition]**

"Then the part that surprises people.

I'm assessed twelve thousand four hundred in OSAP. But OSAP doesn't arrive as
money. It goes to your student account, tuition comes off the top, and only
what's left reaches your bank.

Watch."

> **[The reveal appears]**

"Eighteen thousand four hundred on paper. Seven thousand four hundred straight
to the school. And in September — the month I'm actually buying textbooks —
a hundred dollars.

Most students genuinely don't know that until it happens to them."

---

## 2:20 – 2:45 · The forecast

> **[Enter balance and income]**

"So can I afford the term?

We could give you a date. But a single date is a guess dressed up as a fact —
nobody spends exactly the same amount every month.

So instead it runs the whole term two thousand times, varying each category
realistically. Course costs stay fixed, because those we actually know."

> **[Point at the fan chart]**

"That's the uncertainty widening over the term — and those hard drops are the
textbook and the lab kit landing.

Nineteen percent chance I run short. Which means: in two thousand simulated
terms, I went below zero in three hundred and eighty-four of them."

> **[Click "Drop" on the expensive course]**

"And if I'm thinking about dropping a course — there's what it saves, and
there goes the crunch week."

---

## 2:45 – 2:55 · Close

> **[Screen: the term spine again, or the landing page]**

"n8n runs the pipeline. Claude does the extraction, and it's required to quote
the syllabus for everything it reports.

Every deadline goes on your calendar. Every dollar shows up before it hits
your card.

That's Termsheet."

---

# Delivery notes

**Say the numbers slowly.** They're the whole argument. "A hundred dollars"
lands; "one-zero-zero" doesn't.

**Pause after "a syllabus is a bill nobody itemizes"** and after "**a hundred
dollars**". Two beats. Those are the two moments a judge either leans in or
doesn't.

**Don't apologise for anything.** No "as you can see", no "we didn't have time
to". If something's rough, just don't point the camera at it.

**Record the screen and the audio separately** if you can. Talking while
clicking makes both worse. Do a clean screen pass, then narrate over it.

**If a live upload feels risky**, use the "A full course load" worked example
button — it renders the whole product instantly with no API call and no
network. Nobody watching can tell, and it cannot fail on camera.

**Three things to cut first if you're over time:**
1. The clickable detail panel at 1:00 (nice, not essential)
2. The "drop a course" bit at 2:40
3. Shorten the intro to just the last line

**Never cut:** the crunch week, the OSAP reveal, and "384 of 2,000". Those are
the three things nobody else will have.
