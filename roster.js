'use strict';

/* ============================================================
BOS THROWDOWN - ROSTER
============================================================ */

const ROSTER = [
{ id:'tmoney', name:'T Money', rung:1, hp:100, speed:5, reach:70, light:6, heavy:11, ai:0.28, weapon:'cd',
taunt:"You already lost the moment you stepped on the lot." },
{ id:'sikotik', name:'Sikotik', rung:2, hp:100, speed:6, reach:65, light:7, heavy:10, ai:0.33, weapon:'vape',
taunt:"They call me Sikotik for a reason, bro." },
{ id:'ryan', name:'Ryan the Broadcaster', rung:3, hp:105, speed:5, reach:72, light:6, heavy:11, ai:0.37, weapon:'mic',
taunt:"Camera's rolling. Hope you brought a highlight reel." },
{ id:'brayden', name:'Brayden B.O.S.', rung:4, hp:107, speed:6, reach:69, light:7, heavy:11, ai:0.42, weapon:'mic',
taunt:"B.O.S. runs this lot. Believe that." },
{ id:'bcthekid', name:'B.C. The Kid', rung:5, hp:108, speed:6, reach:68, light:7, heavy:11, ai:0.46, weapon:'bat',
taunt:"Kid's about to teach a lesson tonight." },
{ id:'ali3nlee', name:'Ali3n Lee', rung:6, hp:112, speed:6, reach:70, light:8, heavy:12, ai:0.52, weapon:'gun',
taunt:"Out of this world, homie. You ain't ready." },
{ id:'xackley', name:'X-Ackley', rung:7, hp:118, speed:6, reach:74, light:8, heavy:13, ai:0.58, weapon:'katana',
taunt:"Hope you're comfortable \u2014 this is getting recorded." },
{ id:'tsspectre', name:'T.S. The Spectre', rung:8, hp:122, speed:7, reach:76, light:8, heavy:13, ai:0.64, weapon:'scythe',
taunt:"Every bar I drop hits harder than this fist." },
{ id:'wraith', name:'Wraith', rung:9, hp:140, speed:7, reach:80, light:10, heavy:16, ai:0.78, weapon:'chainscythe',
taunt:"I carry this whole crew. You're just the warm-up." }
];

const SHADOW_ROSTER = [
{ id:'shadowx', name:'Shadow X-Ackley', hp:150, speed:8, reach:78, light:10, heavy:16, ai:0.85, weapon:'katana',
taunt:"I am every round you ever lost, stacked into one.", shadow:true },
{ id:'shadowtsspectre', name:'Shadow T.S. The Spectre', hp:158, speed:8.5, reach:80, light:11, heavy:17, ai:0.90, weapon:'scythe',
taunt:"The bars turned on you. Every one of them.", shadow:true },
{ id:'shadowwraith', name:'Shadow Wraith', hp:175, speed:9, reach:84, light:12, heavy:19, ai:0.97, weapon:'bigscythe',
taunt:"You carried nothing. I carried the weight of you.", shadow:true }
];

const POSES = ['front', 'side', 'back', 'profile'];

function getById(id){
  return ROSTER.find(c => c.id === id) || SHADOW_ROSTER.find(c => c.id === id) || null;
}

/* Mirrors borrow the source fighter's photos; everyone else uses their own id. */
function artIdFor(data){
  return data.mirror ? data.sourceId : data.id;
}

function buildLadder(pickedId){
  const ladder = [];
  ROSTER.forEach(c => {
    if (c.id === pickedId){
      ladder.push({
        ...c,
        id: 'mirror_' + c.id,
        name: c.name + ' (Mirror)',
        mirror: true,
        shadow: true,
        sourceId: c.id,
        hp: Math.round(c.hp * 1.05),
        light: Math.round(c.light * 1.05),
        heavy: Math.round(c.heavy * 1.05),
        ai: Math.min(0.95, c.ai + 0.12),
        taunt: "You against everything you try not to see."
      });
    } else {
      ladder.push(c);
    }
  });
  return ladder;
}
