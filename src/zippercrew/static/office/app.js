import { WORLD, PEOPLE, VIEW, WALK_SPEED } from './world.js';
import { createArt, labelTexture, CHARACTER_ANCHORS } from './art.js';
import { createNavigation } from './navigation.js';
import { DecisionAttention } from './attention.js';
import { OfficeActivity } from './activity.js';
import { OfficeAmbient } from './ambient.js';
import { OfficeMascot } from './mascot.js';
import { OfficeSurfaces } from './surfaces.js';
import { OfficeSession } from './session.js';
import { TaskBoard } from './task-board.js';
import { OfficeHandoffs } from './handoffs.js';
import { PALETTES } from './palettes.js';
import { Seating } from './seating.js';
import { NightLighting } from './lighting.js';
import { AvatarMotion, DIRECTIONS } from './avatar-motion.js';
import { OfficeInterface } from './interface.js';

const $=id=>document.getElementById(id);
// Odd-width bitmap labels and markers need integer origins as well as positions.
const pixelCenter=sprite=>sprite.setOrigin(Math.floor(sprite.width/2)/sprite.width,Math.floor(sprite.height/2)/sprite.height);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');

class Studio extends Phaser.Scene {
  constructor(){super('Studio');this.people=new Map();this.paused=reducedMotion.matches;this.elapsed=0;this.worldTime=0;this.selected=null;this.hovered=null;this.conversation=null;this.ready=false;this.mood=new URLSearchParams(location.search).get('mood')==='night'?'night':'day';this.explicitMood=new URLSearchParams(location.search).has('mood');this.themedImages=[];this.zoneLabels=[];}
  themedImage(x,y,key){const sprite=this.add.image(x,y,this.lighting.textureKey(this.mood,key,x,y));this.themedImages.push({sprite,key,x,y});return sprite;}
  create(){
    this.cameras.main.setRoundPixels(true).setScroll(VIEW.x,VIEW.y);
    for(const mood of ['day','night'])createArt(this,mood);
    this.lighting=new NightLighting(this);
    this.nav=createNavigation();this.seating=new Seating(this);
    this.themedImage(0,0,'architecture').setOrigin(0).setDepth(-3);
    // A true Phaser tilemap. Tile indices provide controlled wood variation.
    const {tile,floor}=WORLD;
    const data=Array.from({length:WORLD.height/tile},(_,y)=>Array.from({length:WORLD.width/tile},(_,x)=>y*tile>=floor.y&&y*tile<floor.y+floor.height&&x*tile>=floor.x&&x*tile<floor.x+floor.width?((x+(y%2)*2)%4):-1));
    this.map=this.make.tilemap({data,tileWidth:tile,tileHeight:tile});
    this.floorTiles=this.map.addTilesetImage('floor-tiles',`${this.mood}:floor-tiles`,tile,tile,0,0);
    this.map.createLayer(0,this.floorTiles,0,0).setDepth(-2);
    for(const z of WORLD.zones){this.themedImage(z.x,z.y,`rug-${z.id}`).setOrigin(0).setDepth(-1);const sprite=this.add.image(z.x+8,z.y+(z.labelOffsetY??-15),labelTexture(this,z.label,{color:'zone'})).setOrigin(0).setDepth(1);this.zoneLabels.push({sprite,text:z.label});}
    this.themedImage(0,0,'lighting').setOrigin(0).setDepth(-.5);
    // Render shadows and furniture in the same coordinate system. Floor-bound
    // sorting lets characters pass both in front of and behind each object.
    for(const f of WORLD.furniture){
      if(f.type==='taskBoard')continue; // Dynamic text is rendered by TaskBoard.
      const key=f.type==='chair'?`chair-${f.variant}-back`:this.textures.exists(`${this.mood}:${f.type}-${f.variant}`)?`${f.type}-${f.variant}`:f.type;
      const sprite=this.themedImage(f.x,f.y,key).setOrigin(0).setDepth(f.y+(f.footprint?.[1]??0)+(f.footprint?.[3]??30));
      if(f.owner){
        sprite.contextOwner=f.owner;sprite.setInteractive({useHandCursor:true});
        sprite.on('pointerup',(pointer,_x,_y,event)=>{if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return;event.stopPropagation();this.ui.showTask(f.owner);});
      }
      if(f.seat){
        const chair=this.seating.chairs.get(f.id),feet=this.seating.points(chair).feet;
        // Seat/base behind the person; desk-chair backrest and arms in front.
        chair.back=sprite.setDepth(feet.y-1);
        chair.front=this.themedImage(f.x,f.y,f.type==='chair'?`chair-${f.variant}-front`:'armchair-front').setOrigin(0).setDepth(feet.y+1);
      }
    }
    this.board=new TaskBoard(this);
    this.surfaces=new OfficeSurfaces(this);this.attention=new DecisionAttention(this);
    this.destination=pixelCenter(this.themedImage(0,0,'destination')).setDepth(2).setVisible(false);
    this.selection=pixelCenter(this.themedImage(0,0,'selection')).setDepth(3).setVisible(false);
    for(const data of PEOPLE){
      const p={...data,route:[],motion:new AvatarMotion(data.direction,this.people.size),bubble:null,bubbleUntil:0,onArrival:null,seated:null,transition:null,seatApproach:null};
      p.sprite=this.add.sprite(p.x,p.y,`${this.mood}:person-${p.id}`,DIRECTIONS[p.direction]*4).setOrigin(CHARACTER_ANCHORS.feet.x/32,CHARACTER_ANCHORS.feet.y/36).setDepth(p.y).setInteractive(new Phaser.Geom.Rectangle(5,2,23,34),Phaser.Geom.Rectangle.Contains);
      p.sprite.on('pointerover',()=>{this.hovered=p.id;this.game.canvas.style.cursor='pointer';});
      p.sprite.on('pointerout',()=>{this.hovered=null;this.game.canvas.style.cursor='crosshair';});
      p.sprite.on('pointerup',(pointer,_x,_y,event)=>{if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return;event.stopPropagation();this.select(p.id);});
      p.nameTag=pixelCenter(this.add.image(p.x,p.y+9,this.nameTexture(p))).setDepth(700).setVisible(p.id==='human');
      this.people.set(p.id,p);
    }
    this.cast=new Map(this.people);
    this.setWorkflow('review');
    this.seating.sit(this.people.get('worker'),this.seating.chairs.get('chair-1'),true);
    this.talkDots=pixelCenter(this.add.image(0,0,labelTexture(this,'...',{background:'bubble',color:'bubbleInk',bubble:true}))).setDepth(810).setVisible(false);
    this.seating.sit(this.people.get('reviewer'),this.seating.chairs.get('chair-2'),true);
    this.input.on('pointerup',pointer=>{
      if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return; // A touch pan is not a walking command.
      // Sprite selection and floor movement are mutually exclusive.
      if(this.input.hitTestPointer(pointer).some(o=>o.contextOwner||[...this.people.values()].some(p=>p.sprite===o)))return;
      this.ui.dismiss(false);this.ui.explored();
      const chair=[...this.seating.chairs.values()].find(f=>pointer.worldX>=f.x&&pointer.worldX<=f.x+(f.type==='chair'?24:30)&&pointer.worldY>=f.y&&pointer.worldY<=f.y+(f.type==='chair'?27:34));
      if(chair){if(!this.requestSit('human',chair.id,'Taking a seat'))this.say('human','THAT SEAT IS TAKEN.',2.5);$('game').focus({preventScroll:true});return;}
      if(pointer.worldX<38||pointer.worldX>523||pointer.worldY<69||pointer.worldY>316)return;
      const moved=this.moveTo('human',{x:pointer.worldX,y:pointer.worldY},{status:'Exploring the studio',onArrival:()=>{this.people.get('human').status='Taking it all in';this.greetNearby();}});
      if(moved){const p=this.people.get('human'),last=p.route.at(-1)||p.goal;this.destination.setPosition(Math.round(last.x),Math.round(last.y)).setVisible(true);}
      $('game').focus({preventScroll:true});
    });
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,ESC',false);
    this.input.keyboard.on('keydown',event=>{if(document.activeElement===$('game')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key))event.preventDefault();});
    this.game.canvas.style.touchAction='pan-x pan-y';
    this.buildUI();this.setMood(this.mood);this.resize(true);this.ready=true;window.studio=this;
    new ResizeObserver(()=>this.resize()).observe($('scene-scroll'));
    window.addEventListener('resize',()=>this.resize());
    reducedMotion.addEventListener('change',event=>{this.paused=event.matches||this.session?.preferences?.motion==='reduced';this.updatePauseUI();});
    this.updatePauseUI();
    this.handoffs=new OfficeHandoffs(this);
    this.activity=new OfficeActivity(this);this.ambient=new OfficeAmbient(this);
    this.mascot=new OfficeMascot(this);
    this.session=new OfficeSession(this);this.session.boot();
  }
  setWorkflow(workflow){
    for(const id of ['reviewer','planner']){
      const include=id==='planner'?workflow==='double_review':workflow!=='direct',present=this.people.has(id);
      if(include===present)continue;
      this.ambient?.cancel();this.handoffs?.cancel();
      const p=this.cast.get(id);
      if(!include){
        if(this.selected===p.id)this.select(null);
        this.seating.cancelApproach(p);
        for(const chair of this.seating.chairs.values())if(chair.occupant===p.id)chair.occupant=null;
        p.route=[];p.transition=null;p.onArrival=null;p.seated=null;p.bubble?.destroy();p.bubble=null;
        p.sprite.setVisible(false).disableInteractive();p.nameTag.setVisible(false);this.people.delete(p.id);
      }else{
        this.people.set(p.id,p);p.sprite.setVisible(true).setInteractive();p.liveStatus='Ready';
        this.seating.sit(p,this.seating.chairs.get(p.chairId),true);
      }
    }
  }
  resize(fit=false){
    const view=$('scene-scroll'),dpr=window.devicePixelRatio||1;
    this.game.canvas.getContext('2d').imageSmoothingEnabled=false;
    // Fit uses integer physical pixels. Manual zoom uses smaller unfiltered
    // steps; sprites retain their integer world coordinates and textures.
    const padding=getComputedStyle(view),availableWidth=view.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight),availableHeight=view.clientHeight-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom);
    // Keep avatars readable on phones; pan the native-size office instead of
    // fitting the entire world into a tiny Retina thumbnail.
    const ideal=Math.min(availableWidth*dpr/VIEW.width,availableHeight*dpr/VIEW.height);
    // On desktops, a tiny amount of panning is preferable to losing a full
    // integer zoom step. Phones retain readable avatars and deliberate panning.
    const next=Math.ceil(ideal),gentleOverflow=availableWidth>=1000&&next/ideal<=1.08;
    const fitted=Math.max(Math.ceil(dpr),gentleOverflow?next:Math.floor(ideal));
    if(fit||!this.manualZoom)this.physicalScale=fitted;
    const maxScale=Math.max(1,Math.floor(8*dpr));
    this.physicalScale=Math.max(1,Math.min(maxScale,this.physicalScale));
    const cssScale=this.physicalScale/dpr,w=Math.round(VIEW.width*this.physicalScale)/dpr,h=Math.round(VIEW.height*this.physicalScale)/dpr;
    this.game.canvas.style.width=`${w}px`;this.game.canvas.style.height=`${h}px`;
    $('game').style.width=`${w}px`;$('game').style.height=`${h}px`;
    view.style.justifyItems=w>availableWidth?'start':'center';view.style.alignItems=h>availableHeight?'start':'center';
    if(fit||!this.manualZoom){view.scrollLeft=Math.max(0,(w-availableWidth)/2);view.scrollTop=Math.max(0,(h-availableHeight)/2);}
    this.scale.updateBounds();$('zoom-out').disabled=this.physicalScale<=1;$('zoom-in').disabled=this.physicalScale>=maxScale;
    $('fit').textContent=this.manualZoom?`${Math.round(cssScale*100)}%`:'Fit';
    $('fit').title=`Fit office to view · current zoom ${Math.round(cssScale*100)}%`;
    this.ui?.reposition();
  }
  nameTexture(p){return labelTexture(this,p.name,{background:p.id==='human'?'#f3edd7':null,color:p.id==='human'?'bubbleInk':'ink',accent:p.id==='human'?'humanLabel':p.id});}
  setMood(mood){
    if(!PALETTES[mood])return;
    this.mood=mood;document.documentElement.dataset.mood=mood;
    for(const {sprite,key,x,y} of this.themedImages)sprite.setTexture(this.lighting.textureKey(mood,key,x,y));
    this.floorTiles.setImage(this.textures.get(`${mood}:floor-tiles`));
    for(const {sprite,text} of this.zoneLabels)sprite.setTexture(labelTexture(this,text,{color:'zone'}));
    for(const p of this.people.values()){
      p.sprite.setTexture(this.lighting.characterKey(p),p.sprite.frame.name);
      p.nameTag.setTexture(this.nameTexture(p));
      if(p.bubble)p.bubble.setTexture(this.bubbleTexture(p));
    }
    this.board?.update(this.session?.room,this.session?.taskRun,this.session?.connected);
    this.talkDots.setTexture(labelTexture(this,'...',{background:'bubble',color:'bubbleInk',bubble:true}));
    document.querySelectorAll('[data-mood-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.moodChoice===mood)));
    document.querySelectorAll('canvas[data-portrait]').forEach(canvas=>this.portrait(canvas,canvas.dataset.portrait));
    document.querySelectorAll('[data-person]').forEach(button=>button.style.setProperty('--role-accent',PALETTES[mood][button.dataset.person]));
    if(this.selected){this.updatePerson();this.portrait($('person-portrait'),this.selected);}
    if(this.ui?.taskOwner)$('task-owner').style.setProperty('--role-accent',PALETTES[mood][this.ui.taskOwner]);
    document.querySelector('meta[name="theme-color"]').content=mood==='night'?'#262e39':'#f8f5ef';
    const url=new URL(location.href);url.searchParams.set('mood',mood);history.replaceState(null,'',url);
  }
  portrait(canvas,id){const texture=this.textures.get(`${this.mood}:person-${canvas.dataset.appearance||this.people.get(id)?.appearance||id}`);const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(texture.getSourceImage(),0,0,32,36,0,0,32,36);}
  buildUI(){
    const zoom=step=>{
      const view=$('scene-scroll'),viewport=view.getBoundingClientRect(),before=this.game.canvas.getBoundingClientRect();
      const centerX=viewport.left+view.clientWidth/2,centerY=viewport.top+view.clientHeight/2;
      const anchorX=(centerX-before.left)/before.width,anchorY=(centerY-before.top)/before.height;
      this.manualZoom=true;this.physicalScale+=step*(window.devicePixelRatio||1);this.resize();
      const after=this.game.canvas.getBoundingClientRect();
      view.scrollLeft+=after.left+anchorX*after.width-centerX;view.scrollTop+=after.top+anchorY*after.height-centerY;
    };
    $('zoom-in').onclick=()=>zoom(.125);
    $('zoom-out').onclick=()=>zoom(-.125);
    $('fit').onclick=()=>{this.manualZoom=false;this.resize(true);};
    $('close-person').onclick=()=>this.select(null);
    document.querySelectorAll('[data-mood-choice]').forEach(button=>button.onclick=()=>this.setMood(button.dataset.moodChoice));
    this.ui=new OfficeInterface(this);this.updateSeatUI();
  }
  requestSit(id,chairId,status){return this.seating.request(id,chairId,status);}
  updateSeatUI(){this.ui?.updatePerson();}
  updatePauseUI(){this.updateStatus();}
  updateStatus(){if(this.session){this.session.refreshChrome();return;}const c=this.conversation;$('scene-state').textContent=this.paused?'A quiet moment · paused':c?`${this.people.get(c.a).name} & ${this.people.get(c.b).name} · comparing notes`:'A little focus, a little company';if(this.selected)this.updatePerson();}
  updatePerson(){const p=this.people.get(this.selected);if(!p)return;$('person-name').textContent=p.name;$('person-role').textContent=`${p.role} · ${p.kind}`;$('person-role').style.setProperty('--role-accent',PALETTES[this.mood][p.id]);$('person-description').textContent=p.description;this.ui?.updatePerson();}
  select(id){this.selected=id;$('person-card').hidden=!id;this.selection.setVisible(!!id);document.querySelectorAll('[data-person]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.person===id)));if(id){this.updatePerson();this.portrait($('person-portrait'),id);}this.ui?.onSelect(id);}
  bubbleTexture(p){return labelTexture(this,p.bubbleText,{background:p.bubbleKind==='work'?'workBubble':p.bubbleKind==='idle'?'idleBubble':'bubble',color:'bubbleInk',bubble:true,thought:p.bubbleKind==='idle',roomStatus:p.bubbleKind==='work',accent:['work','conversation'].includes(p.bubbleKind)?p.id:null});}
  say(id,text,duration=4,kind='message'){const p=this.people.get(id);p.bubble?.destroy();p.bubbleText=text;p.bubbleKind=kind;p.bubble=pixelCenter(this.add.image(Math.round(p.x),Math.round(p.y)-43,this.bubbleTexture(p))).setDepth(820);p.bubbleUntil=this.worldTime+duration;this.placeBubble(p);this.ui?.record(p.name,text);}
  placeBubble(p){
    const sprite=p.bubble;if(!sprite)return;
    const half=Math.floor(sprite.width/2);
    sprite.setOrigin(half/sprite.width,1).setPosition(
      Math.round(Math.max(VIEW.x+half+3,Math.min(VIEW.x+VIEW.width-(sprite.width-half)-3,p.x))),
      Math.round(Math.max(VIEW.y+sprite.height+2,p.y-36)));
  }
  endConversation(){this.conversation=null;this.talkDots?.setVisible(false);for(const p of this.people.values())if(!(p.reactionUntil>this.worldTime)){p.bubble?.destroy();p.bubble=null;}this.updateStatus();}
  moveTo(id,target,options={}){
    const {status='Taking a short walk',onArrival=null,preserveSeatReservation=false}=options;
    const p=this.people.get(id);
    if(!preserveSeatReservation)this.seating.cancelApproach(p);
    if(p.seated){p.goal=target;this.seating.stand(p,()=>this.moveTo(id,target,options));this.updateSeatUI();return true;}
    const path=this.nav.route(p,target,this.collisionBodies(p));
    if(!path.length)return false;
    if(this.conversation&&(this.conversation.a===id||this.conversation.b===id))this.endConversation();
    p.route=path;p.goal=target;p.blockedFor=0;p.onArrival=onArrival;p.status=status;
    // A pending return-to-desk transition must not erase a fresh confirmation.
    if(!(p.reactionUntil>this.worldTime)){p.bubble?.destroy();p.bubble=null;}
    this.updateSeatUI();this.updateStatus();return true;
  }
  collisionBodies(person){return [...this.people.values()].filter(p=>p!==person).concat(this.mascot?[this.mascot]:[]);}
  greetNearby(){this.updateStatus();}
  update(_time,delta){if(!this.ready)return;const dt=Math.min(delta/1000,.05);
    this.worldTime+=dt;
    if(!this.paused){this.elapsed+=dt;}
    const previous=new Map([...this.people.values()].map(p=>[p.id,{x:p.x,y:p.y,posture:!!(p.seated||p.transition)}]));
    this.walkHuman(dt);
    for(const p of this.people.values()){
      const canMove=p.id==='human'||!this.paused;
      if(p.transition&&canMove)this.seating.update(p,dt);
      if(p.route.length&&canMove&&!p.transition){
        let budget=dt*(p.id==='human'?WALK_SPEED.human:WALK_SPEED.agent);
        // Consume reached nodes and carry unused movement through corners. A
        // zero-length grid snap must never produce an idle frame or turn up.
        while(p.route.length&&budget>.0001&&!p.transition){
          const target=p.route[0],dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),step=Math.min(d,budget);
          const nx=p.x+(d?dx/d*step:0),ny=p.y+(d?dy/d*step:0);
          // Pause briefly for somebody already occupying the next few pixels.
          const blocked=this.collisionBodies(p).some(other=>Math.hypot(nx-other.x,ny-other.y)<11&&Math.hypot(nx-other.x,ny-other.y)<Math.hypot(p.x-other.x,p.y-other.y));
          if(blocked){
            p.blockedFor+=dt;
            if(p.blockedFor>.6){
              const reroute=this.nav.route(p,p.goal,this.collisionBodies(p));
              if(reroute.length)p.route=reroute;
              p.blockedFor=0;
            }
            break;
          }
          p.blockedFor=0;p.x=nx;p.y=ny;budget-=step;
          if(d<=step+.0001){
            p.x=target.x;p.y=target.y;p.route.shift();
            if(!p.route.length){
              const onArrival=p.onArrival;p.onArrival=null;onArrival?.();
              if(p.id==='human')this.destination.setVisible(false);
              this.updateStatus();break;
            }
          }
        }
      }
      const old=previous.get(p.id),dx=p.x-old.x,dy=p.y-old.y;
      // Explicit chair/conversation poses take priority over locomotion facing.
      if(p.direction!==p.motion.direction)p.motion.face(p.direction);
      const final=p.route[0],nearArrival=!p.keyboardIntent&&p.route.length<=1&&(!final||Math.hypot(final.x-p.x,final.y-p.y)<3);
      const locomotion=p.motion.update(dx,dy,canMove?dt:0,{allowTurn:!nearArrival,posture:old.posture||!!(p.seated||p.transition),animateIdle:!this.paused});
      p.direction=p.motion.direction;p.keyboardIntent=false;
      const frame=this.seating.frame(p,this.elapsed)??locomotion;
      const texture=this.lighting.characterKey(p);
      if(p.sprite.texture.key!==texture)p.sprite.setTexture(texture,frame);
      p.sprite.setPosition(Math.round(p.x),Math.round(p.y)).setDepth(Math.round(p.y)).setFrame(frame);
      const partner=this.conversation?.a===p.id?this.people.get(this.conversation.b):this.conversation?.b===p.id?this.people.get(this.conversation.a):null;
      const labelOffset=partner?(p.x<partner.x?-6:6):0;
      p.nameTag.setPosition(Math.round(p.x)+labelOffset,Math.round(p.y)+9).setVisible(p.id==='human'||this.selected===p.id||this.hovered===p.id||[this.conversation?.a,this.conversation?.b,this.handoffs?.active?.sender,this.handoffs?.active?.recipient].includes(p.id));
      if(p.bubble){this.placeBubble(p);if(this.worldTime>=p.bubbleUntil){p.bubble.destroy();p.bubble=null;}}
    }
    this.handoffs?.update(dt);
    this.ambient?.update(dt);this.activity?.update(dt);this.surfaces.update();this.attention.update();this.session?.configuration.updateAttention();
    this.mascot?.update(dt);
    if(this.selected){const p=this.people.get(this.selected);this.selection.setPosition(Math.round(p.x),Math.round(p.y)+1);}
    const c=this.conversation;if(c){const a=this.people.get(c.a),b=this.people.get(c.b);this.talkDots.setPosition(Math.round((a.x+b.x)/2),Math.round(Math.min(a.y,b.y))-36).setVisible(!a.bubble&&!b.bubble);}
  }
  walkHuman(dt){if(document.activeElement!==$('game'))return;const k=this.keys,dx=Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),dy=Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown);if(!dx&&!dy)return;const p=this.people.get('human');this.seating.cancelApproach(p);this.updateSeatUI();if(p.seated){this.seating.stand(p);return;}p.route=[];p.onArrival=null;this.destination.setVisible(false);const speed=WALK_SPEED.human*dt/Math.hypot(dx,dy),nx=p.x+dx*speed,ny=p.y+dy*speed;const can=(x,y)=>this.nav.free(x,y)&&!this.collisionBodies(p).some(other=>Math.hypot(x-other.x,y-other.y)<11);if(can(nx,p.y))p.x=nx;if(can(p.x,ny))p.y=ny;p.keyboardIntent=true;}
  inspect(){return {ready:this.ready,mood:this.mood,paused:this.paused,time:this.elapsed,selected:this.selected,conversation:this.conversation,physicalScale:this.physicalScale,people:[...this.people.values()].map(p=>({id:p.id,x:p.x,y:p.y,direction:p.direction,walking:p.route.length>0,status:p.status,seating:this.seating.inspect(p)})),furniture:WORLD.furniture.length,tileLayers:this.map.layers.length,board:this.board?.inspect(),handoffs:this.handoffs?.inspect(),ambient:this.ambient?.inspect(),clock:this.surfaces?.clockTime};}
}

new Phaser.Game({type:Phaser.CANVAS,parent:'game',width:VIEW.width,height:VIEW.height,transparent:true,pixelArt:true,roundPixels:true,antialias:false,antialiasGL:false,banner:false,audio:{noAudio:true},fps:{target:30,forceSetTimeOut:true},input:{keyboard:true,touch:{capture:false}},scene:Studio,render:{pixelArt:true,roundPixels:true,antialias:false}});
