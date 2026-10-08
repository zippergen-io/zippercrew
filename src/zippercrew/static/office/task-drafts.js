import {api} from './session.js';

// Serial writes per room: a slow response can never overwrite newer typing.
// Closing an editor flushes its draft; failed saves retain it for retry.
export class TaskDrafts {
  constructor(session){
    this.session=session;this.rooms=new Map();
    window.addEventListener('beforeunload',event=>{
      if([...this.rooms.values()].some(d=>d.value!==d.saved)){event.preventDefault();event.returnValue='';}
    });
    document.getElementById('detail-dialog').addEventListener('close',()=>this.flushAll());
  }
  get(room){
    let draft=this.rooms.get(room.id);
    if(!draft){draft={id:room.id,value:room.brief,saved:room.brief,listeners:new Set()};this.rooms.set(room.id,draft);}
    else if(!draft.pending&&draft.value===draft.saved&&draft.saved.trim()!==room.brief){draft.value=draft.saved=room.brief;draft.error=null;}
    return draft;
  }
  emit(draft){for(const listener of draft.listeners)listener();}
  edit(draft,value){
    draft.value=value;draft.error=null;clearTimeout(draft.timer);
    if(this.session.room?.id===draft.id){this.session.room.brief=value;this.session.refreshChrome();}
    draft.timer=setTimeout(()=>this.flush(draft.id).catch(()=>{}),600);this.emit(draft);
  }
  flushAll(){for(const id of this.rooms.keys())this.flush(id).catch(()=>{});}
  async flush(id){
    const draft=this.rooms.get(id);if(!draft)return;
    clearTimeout(draft.timer);
    if(draft.pending)return draft.pending;
    if(draft.value===draft.saved)return;
    draft.error=null;
    draft.pending=(async()=>{
      // Publish pending state before starting the first request.
      await Promise.resolve();this.emit(draft);
      while(draft.value!==draft.saved){
        const value=draft.value;
        const room=await api(`/api/rooms/${draft.id}/save`,{brief:value});
        draft.saved=value;
        if(this.session.room?.id===draft.id&&draft.value===value){
          this.session.room.brief=room.brief;this.session.refreshChrome();
        }
      }
    })().catch(error=>{draft.error=error.message;throw error;}).finally(()=>{draft.pending=null;this.emit(draft);});
    return draft.pending;
  }
}
