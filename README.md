# Cheenti Dawat · چیونٹی کی دعوت

**Ant Feast** is a pixel food puzzle you can install on your phone with no app store. Send ant colonies to eat Pakistani dishes one colour at a time: samosa, chai, biryani, nihari, gol gappay, and up to a Minar-e-Pakistan cake.

## How to play
- Ants climb up from their nest under the board. They can only bite the **lowest piece** left in each column.
- Tap the colony at the front of a lane. Its ants eat that many pieces of their own colour.
- Ants that can't reach enough food wait in the **thaal**. If it overflows, you lose.

Twists unlock as you go: 🧊 Barf (ice), 🍲 Dhakkan (hidden colours), 🍱 Tiffin lids, 💍 Baraat (linked colonies) and 🕯️ Loadshedding.

## Install on a phone
Open the site in Chrome on Android or Safari on iPhone, then choose **Add to Home Screen**. After the first visit it works offline.

## Develop
```bash
node serve.mjs          # http://localhost:5174 (also prints a LAN address for phones)
node tools/verify.mjs   # checks every level is solvable and how hard it is
node tools/make-icons.mjs
```
