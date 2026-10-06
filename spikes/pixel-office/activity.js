// Cosmetic demo only. Every action has a destination/status; no model calls,
// production events, filesystem operations, or backend work are represented.
export class StudioActivity {
  constructor(scene){this.scene=scene;this.time=0;this.index=0;this.cycle=0;this.events=[
    [0,()=>this.conversation('planner','reviewer',"LET'S COMPARE NOTES.")],
    [4,()=>this.scene.say('reviewer','LOOKS GOOD TO ME.',3.8)],
    [8,()=>{this.scene.endConversation();this.home('planner','Laying out the next steps');}],
    [10,()=>this.home('reviewer','Reading through the draft')],
    [15,()=>this.scene.say('worker','ONE THING AT A TIME.',3.5)],
    [21,()=>this.scene.say('planner','A PLAN IS TAKING SHAPE.',4)],
    [28,()=>this.walk('worker',{x:416,y:107},'Taking a coffee break',()=>this.scene.say('worker','COFFEE, THEN A FRESH LOOK.',4))],
    [38,()=>this.walk('planner',{x:368,y:201},'Heading to the nook')],
    [41,()=>this.walk('reviewer',{x:394,y:201},'Joining Mira in the nook')],
    [46,()=>this.home('worker','Working through the next detail')],
    [54,()=>this.conversation('planner','reviewer','A QUICK SECOND OPINION?')],
    [60,()=>this.scene.say('reviewer','YES, THAT MAKES SENSE.',4)],
    [66,()=>{this.scene.endConversation();this.home('reviewer','Checking the small details');}],
    [69,()=>this.home('planner','Putting the pieces together')],
    [77,()=>this.scene.say('reviewer','THE DETAILS MATTER.',4)],
    [88,()=>this.walk('planner',{x:368,y:201},'Stretching their legs')],
    [91,()=>this.walk('reviewer',{x:394,y:201},'Making time for a quick chat')],
  ];}
  walk(id,target,status,onArrival){this.scene.moveTo(id,target,{status,onArrival});}
  home(id,status){const p=this.scene.people.get(id);this.scene.requestSit(id,p.chairId,status);}
  conversation(a,b,text){const aa=this.scene.people.get(a),bb=this.scene.people.get(b);if(aa.route.length||bb.route.length||Math.hypot(aa.x-bb.x,aa.y-bb.y)>40)return;
    this.scene.conversation={a,b};aa.direction='right';bb.direction='left';aa.status=`Comparing notes with ${bb.name}`;bb.status=`Comparing notes with ${aa.name}`;this.scene.say(a,text,3.8);this.scene.updateStatus();}
  update(dt){this.time+=dt;while(this.index<this.events.length&&this.time>=this.events[this.index][0])this.events[this.index++][1]();if(this.time>104){this.time=0;this.index=0;this.cycle++;}}
}
