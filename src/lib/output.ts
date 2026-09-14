export type Stage = { text: string; done: boolean; completedAt?: string };
export type Entry = { id: string; title: string; question: string; answer: string; category: string; kind: string; stages: Stage[]; archived: boolean; createdAt: string; updatedAt: string };
export const blankStages = (): Stage[] => [{text:'',done:false},{text:'',done:false},{text:'',done:false}];
export const sampleAnswer = `Man, I felt this in my soul. A year ago, my life felt like a chore. Every single day was mapped out to the minute, and I had a laundry list of problems at work. The toxic corporate politics felt like a daily moral injury, but I stayed quiet because I felt like I had no one to turn to.

Eventually, I realized staying in that environment was a lost cause. So I changed my mindset: the moment I clock out, work is dead to me.

Now, on weekends, instead of dragging myself to some mediocre social events, I’ve learned to truly enjoy my own company. On Saturdays, I sleep in, leisurely do stuff around the house, or just sit by the window to unwind and navigate my emotions.

Last weekend, I picked up an old sci-fi novel written 30 years ago. It was so ahead of its time that the story still holds up beautifully today. The characters were so fleshed out that I literally couldn’t put it down and finished it in one sitting.

Giving up the meaningless hustle and reclaiming my quiet weekends is, hands down, the best decision I’ve ever made for my own peace of mind. Take a deep breath. You don’t have to prove anything to anyone.`;
export const seedEntries = [
 {id:'welcome-work-life',title:'找回工作之外的生活热情',question:'我感觉每天上班压力很大，生活枯燥，周末闲下来就内耗自责，不知道该怎么找回生活的热情。大家有什么建议吗？',answer:sampleAnswer,category:'生活与成长',kind:'tracking',stages:[{text:'工作不应该占据生活的全部。允许自己休息，学会享受独处，从一件真正喜欢的小事开始。',done:true,completedAt:new Date().toISOString()},{text:'I used to feel guilty about doing nothing on weekends. But I’ve come to realize that rest isn’t a reward you have to earn.\n\nFor me, finding joy in life starts with small things — reading a good book, taking a walk, or simply enjoying my own company.',done:false},{text:'',done:false}]},
 {id:'welcome-small-habits',title:'微小的习惯，如何带来长期改变？',question:'你坚持过的哪个小习惯，给生活带来了最大的改变？',answer:'',category:'习惯与效率',kind:'tracking',stages:blankStages()},
 {id:'welcome-english',title:'Finding joy beyond work',question:'How do you find a balance between work and your personal life?',answer:sampleAnswer,category:'Work & Life',kind:'english',stages:blankStages()}
];
export function wordCount(text:string) { return (text.match(/[a-zA-Z]+(?:['’][a-zA-Z]+)*/g)||[]).length; }
