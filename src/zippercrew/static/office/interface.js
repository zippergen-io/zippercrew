import { VIEW } from './world.js';

const $=id=>document.getElementById(id);

// Modern DOM overlays sit outside Phaser. Opening UI never changes the camera,
// simulation, or route; controls cannot leak pointer/keyboard input into the world.
export class OfficeInterface {
  constructor(scene){
    this.scene=scene;this.panel=null;this.anchor=null;this.taskOwner=null;this.events=[];
    $('menu-toggle').onclick=()=>scene.session?.configuration.toggleDrawer();
    $('close-menu').onclick=()=>{this.closePopovers();$('menu-toggle').focus();};
    $('close-person').onclick=()=>this.dismiss();
    $('close-task').onclick=()=>this.dismiss();
    $('person-task').onclick=()=>this.showDetails(scene.selected);
    $('task-owner').onclick=()=>scene.select(this.taskOwner);
    $('expand-task').onclick=()=>this.showDetails(this.taskOwner);
    for(const id of ['close-detail','back-to-office'])$(id).onclick=()=>$('detail-dialog').close();
    $('detail-dialog').addEventListener('close',()=>{if(!$('detail-dialog').open){this.detailMode=null;$('game').focus({preventScroll:true});}});
    const trapFocus=event=>{
      if(event.key!=='Tab')return;
      const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href]')];
      const visible=buttons.filter(node=>node.getClientRects().length);const first=visible[0],last=visible.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    $('detail-dialog').addEventListener('keydown',trapFocus);
    $('studio-menu').addEventListener('keydown',trapFocus);
    $('detail-dialog').addEventListener('click',event=>{
      const r=event.currentTarget.getBoundingClientRect();
      if(!scene.session?.busy&&event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))event.currentTarget.close();
    });
    document.addEventListener('pointerdown',event=>{
      if(!event.target.closest('.studio-drawer,#menu-toggle'))this.closePopovers();
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||$('detail-dialog').open)return;
      const open=[['studio-menu','menu-toggle']].find(([id])=>!$(id).hidden);
      if(open){this.closePopovers();$(open[1]).focus();}
      else if(this.panel)this.dismiss();
    });
    for(const p of scene.people.values())if(p.bubble)this.record(p.name,p.bubbleText);
  }

  explored(){document.body.classList.add('has-explored');}
  closePopovers(){
    for(const [panel,button] of [['studio-menu','menu-toggle']]){
      $(panel).hidden=true;$(button).setAttribute('aria-expanded','false');
    }
  }
  dismiss(focus=true){
    this.scene.select(null);$('task-card').hidden=true;this.panel=null;this.anchor=null;
    this.closePopovers();if(focus)$('game').focus({preventScroll:true});
  }
  onSelect(id){
    if(!id){if(this.panel==='person-card'){this.panel=null;this.anchor=null;}this.scene.session?.decisions?.humanCard();return;}
    this.closePopovers();$('task-card').hidden=true;this.explored();
    const p=this.scene.people.get(id);
    const neighbors=[...this.scene.people.values()].filter(other=>Math.hypot(other.x-p.x,other.y-p.y)<40);
    this.panel='person-card';this.anchor={x:Math.max(...neighbors.map(other=>other.x))+12,y:p.y-25};
    // Selecting someone from the roster also finds them on a small, panned view.
    const view=$('scene-scroll'),bounds=view.getBoundingClientRect(),canvas=this.scene.game.canvas.getBoundingClientRect();
    const x=canvas.left+(p.x-VIEW.x)*canvas.width/VIEW.width,y=canvas.top+(p.y-VIEW.y)*canvas.height/VIEW.height;
    if(x<bounds.left+40||x>bounds.right-40)view.scrollLeft+=x-(bounds.left+bounds.width/2);
    if(y<bounds.top+80||y>bounds.bottom-80)view.scrollTop+=y-(bounds.top+bounds.height/2);
    this.updatePerson();this.reposition();$('close-person').focus({preventScroll:true});
  }
  updatePerson(){
    const p=this.scene.people.get(this.scene.selected);if(!p)return;
    $('person-activity').textContent=p.exchangeStatus||this.scene.activity?.currentText(p)||p.ambientStatus||p.liveStatus||'Ready';
    this.scene.activity?.renderRecent($('person-recent'),p.id,3);
    $('person-task-title').textContent=this.scene.session?.room?.brief||'Define the task on the whiteboard';
    this.scene.session?.configuration.agentCard(p);
    this.scene.session?.decisions.humanCard();
    this.reposition();
  }
  showTask(owner){this.scene.session?.showTask(owner);}
  reposition(){
    if(!this.panel||!this.anchor)return;
    const panel=$(this.panel),r=this.scene.game.canvas.getBoundingClientRect();
    const x=r.left+(this.anchor.x-VIEW.x)*r.width/VIEW.width,y=r.top+(this.anchor.y-VIEW.y)*r.height/VIEW.height;
    const width=panel.offsetWidth,height=panel.offsetHeight;
    const right=x+38,left=x-width-38;
    panel.style.left=`${Math.round(Math.max(16,Math.min(innerWidth-width-16,right+width<=innerWidth-16?right:left)))}px`;
    panel.style.top=`${Math.round(Math.max(78,Math.min(innerHeight-height-72,y-42)))}px`;
  }
  showDetails(owner){this.scene.session?.showTask(owner);}
  record(){}
  showHistory(){this.scene.session?.showHistory();}
}
