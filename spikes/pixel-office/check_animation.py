"""Regressions for facing chatter, arrival flicker, head registration and pixels."""

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8774/spikes/pixel-office/"

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1040})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function("window.studio?.ready")
    result = page.evaluate("""async () => {
      const {AvatarMotion}=await import('./avatar-motion.js');
      const assert=(ok,message)=>{if(!ok)throw Error(message);};
      // Same behavior at different frame rates, with genuinely small motion and
      // noisy diagonal ratios, not a copy of the state machine's thresholds.
      for(const fps of [20,30,60]){
        const dt=1/fps,m=new AvatarMotion('right');
        for(let i=0;i<fps;i++){
          const size=25*dt;
          m.update(size,size*(i%2?1.04:.96),dt);
          assert(m.direction==='right','Diagonal facing chatter at '+fps);
        }
        for(let i=0;i<fps/2;i++)m.update(0,25*dt,dt);
        assert(m.direction==='down','Deliberate turn ignored at '+fps);
        for(let i=0;i<fps/2;i++){
          m.update(i%2?.08:-.08,i%2?-.06:.06,dt);
          assert(m.direction==='down','Subpixel correction changed facing');
        }
        for(let i=0;i<fps;i++){
          const frame=m.update(0,0,dt);
          assert(m.direction==='down'&&frame<24,'Arrival direction/blink flicker');
        }
        assert(!m.walking,'Did not settle after arrival');
        let blink=false;
        for(let i=0;i<fps*9;i++){const frame=m.update(0,0,dt);blink=blink||frame>=24;}
        assert(blink,'Idle blink never occurs');
        m.update(1,0,dt);
        assert(m.blinkLeft===0,'Blink leaked into movement');

        const walking=new AvatarMotion('right');
        for(let i=0;i<fps;i++)walking.update(25*dt,0,dt);
        const frame=walking.update(0,0,dt);
        assert(walking.walking,'Single stalled frame switched to idle');
        assert(walking.update(0,0,dt)===frame,'Gait advanced without movement');
        const idle=new AvatarMotion('right');
        for(let i=0;i<fps;i++){
          idle.update(i%2?.1:-.1,0,dt);
          assert(!idle.walking&&idle.direction==='right','Tiny corrections started walking');
        }
      }

      // Heads (including hair) must match idle exactly within each direction.
      // Every directional row shares the same frame size and feet registration.
      for(const mood of ['day','night'])for(const p of studio.people.values()){
        const texture=studio.textures.get(`${mood}:person-${p.id}`);
        const context=texture.getSourceImage().getContext('2d');
        for(let dir=0;dir<4;dir++){
          const head=context.getImageData(0,dir*36,32,17).data;
          for(let frame=1;frame<4;frame++){
            const other=context.getImageData(frame*32,dir*36,32,17).data;
            assert(head.every((v,i)=>v===other[i]),`${p.id}/${mood}/${dir}: head shifted`);
            const f=texture.get(dir*4+frame);
            assert(f.width===32&&f.height===36&&!f.trimmed,'Inconsistent sprite bounds');
          }
        }
        assert(p.sprite.displayOriginX===16&&p.sprite.displayOriginY===33,'Feet origin drift');
      }

      studio.game.loop.stop();studio.paused=true;studio.endConversation();
      const you=studio.people.get('human');
      const reset=(x,y,direction='right')=>{
        you.x=x;you.y=y;you.route=[];you.transition=null;you.seated=null;
        you.onArrival=null;you.direction=direction;you.motion=new AvatarMotion(direction);
      };
      const tick=dt=>studio.update(0,dt*1000);
      let samples=0;
      const pixels=()=>{
        for(const sprite of studio.children.list){
          if(!sprite.visible||!sprite.texture)continue;
          assert(sprite.frame.source.scaleMode===1,'Texture smoothing enabled: '+sprite.texture.key);
          for(const n of [sprite.x,sprite.y,sprite.x-sprite.displayOriginX,sprite.y-sprite.displayOriginY])
            assert(Math.abs(n-Math.round(n))<1e-8,`Fractional pixel: ${sprite.texture.key} ${n}`);
        }
        assert(!studio.game.canvas.getContext('2d').imageSmoothingEnabled,'Canvas smoothing enabled');
      };
      const run=(dt,expected)=>{
        const turns=[you.direction],states=[];let last=false;
        for(let i=0;i<1000;i++){
          tick(dt);pixels();samples++;
          if(turns.at(-1)!==you.direction)turns.push(you.direction);
          if(last!==you.motion.walking){last=you.motion.walking;states.push(last);}
          if(!you.route.length&&!you.motion.walking)break;
        }
        assert(!you.route.length,'Route stuck');
        assert(JSON.stringify(turns)===JSON.stringify(expected),'Unstable turns: '+JSON.stringify(turns));
        assert(JSON.stringify(states)==='[true,false]','Walk/idle chatter: '+JSON.stringify(states));
        for(let i=0;i<30;i++){
          tick(dt);pixels();
          assert(you.direction===expected.at(-1)&&Number(you.sprite.frame.name)<24,'Unstable arrival');
        }
      };
      for(const mood of ['day','night'])for(const dt of [1/20,1/30,1/60]){
        studio.setMood(mood);
        reset(320,208);
        you.route=[{x:320,y:208},{x:332,y:208},{x:332.03,y:207.99},{x:344.4,y:208.2},{x:344,y:208}];
        run(dt,['right']);
        reset(320,220);
        you.route=[{x:340,y:220},{x:340,y:260},{x:316,y:260}];
        run(dt,['right','down','left']);
        for(let repeat=0;repeat<5;repeat++){
          assert(studio.moveTo('human',{x:316,y:260}),'Repeated target refused');
          tick(dt);
          assert(you.direction==='left'&&!you.motion.walking&&!you.route.length,'Zero-distance target flickered');
        }
      }

      // Fractional simulation coordinates stay allowed; every rendered object,
      // even an odd-sized speech bubble/marker, still lands on integer pixels.
      reset(320.35,208.65);studio.say('human','A STEADY LITTLE WORLD.');
      studio.select('human');tick(1/30);pixels();
      const before={direction:you.direction,frame:you.sprite.frame.name};
      studio.setMood('day');tick(1/30);studio.setMood('night');tick(1/30);
      assert(you.direction===before.direction&&you.sprite.frame.name===before.frame,'Mood change reset animation');

      // Held keys into the floor boundary produce no fake walking or turn.
      reset(320,312,'right');document.getElementById('game').focus();
      studio.keys.DOWN.isDown=true;
      for(let i=0;i<45;i++){tick(1/30);pixels();}
      studio.keys.DOWN.isDown=false;
      assert(you.x===320&&you.y===312&&!you.motion.walking&&you.direction==='right','Blocked keyboard flicker');
      reset(320,208);studio.keys.DOWN.isDown=true;studio.keys.RIGHT.isDown=true;
      for(let i=0;i<18;i++){tick(1/30);assert(you.direction==='right','Diagonal keys flipped facing');pixels();}
      studio.keys.DOWN.isDown=false;studio.keys.RIGHT.isDown=false;
      for(let i=0;i<12;i++)tick(1/30);
      assert(!you.motion.walking&&you.direction==='right','Keyboard release jitter');
      studio.game.loop.wake();
      return {samples};
    }""")
    print("PASS directional hysteresis, correction/arrival stability, blocked and diagonal keyboard input")
    print("PASS all avatar head frames aligned; integer positions/origins and smoothing disabled")
    print(f"PASS {result['samples']} sprite-state samples across day/night and 20/30/60 Hz")
    zoomed = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=1.1)
    zoomed.goto(URL)
    zoomed.wait_for_function("window.studio?.ready")
    zoomed.evaluate("studio.manualZoom=true;studio.physicalScale=100;studio.resize()")
    assert zoomed.evaluate("Number.isInteger(studio.physicalScale)")
    assert zoomed.locator("#zoom-in").is_disabled()
    zoomed.close()
    print("PASS integer pixel scale at the zoom limit on a fractional-DPR display")
    assert not errors, errors
    browser.close()
    print("PASS no browser errors")
