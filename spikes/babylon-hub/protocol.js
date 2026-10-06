/* The scripted semantic driver is deliberately independent of Babylon.
   A future adapter can feed these events from ZipperGen. Rendering never emits receive. */
export class DemoProtocol {
  constructor(onEvent) {this.onEvent=onEvent;this.seq=0;this.messages=new Map();this.events=[];}
  emit(type,payload={}) {
    const event={seq:++this.seq,type,...payload};
    if(type==='send') {
      const previous=[...this.messages.values()].at(-1);
      if(previous&&!previous.receiveSeq)return null;
      event.id=`proposal-${event.seq}`;event.from='implementer';event.to='reviewer';event.label='Proposal';
      this.messages.set(event.id,{...event,sendSeq:event.seq,receiveSeq:null});
    }
    if(type==='receive') {
      const message=this.messages.get(payload.id);if(!message||message.receiveSeq)return null;
      message.receiveSeq=event.seq;
    }
    this.events.push(event);this.onEvent(event);return event;
  }
}

export class DemoSchedule {
  constructor(protocol) {this.protocol=protocol;this.manual=false;this.index=0;this.schedule=[[7,'send'],[14,'receive'],[24,'attention'],[34,'quiet']];}
  step(time) {
    if(this.manual)return;
    while(this.index<this.schedule.length&&time>=this.schedule[this.index][0]) {
      const type=this.schedule[this.index++][1],id=[...this.protocol.messages.keys()].at(-1);
      this.protocol.emit(type,{id});
    }
  }
}
