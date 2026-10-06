// The same geometry and textures in two authored palettes. Large material
// colors are explicit; small legacy details retain the original pixel drawing.
export const PALETTES = {
  day: {
    label: 'Day', ink: '#60574f', zone: '#806a56', bubble: '#fff3da', bubbleInk: '#605148',
    planner: '#7898aa', worker: '#708a62', reviewer: '#d7836e', human: '#d2a34f',
    lampShade: '#f1d5a3', lampEdge: '#c69b61', screen: '#96bfcc',
  },
  night: {
    label: 'Night', ink: '#e0d6c8', zone: '#b3bac5', bubble: '#dfc8a6', bubbleInk: '#463c37',
    planner: '#8daabb', worker: '#8c9e77', reviewer: '#c87567', human: '#dfb466',
    lampShade: '#edbe78', lampEdge: '#e2a85b', screen: '#83b6c5',
  },
};

// [original drawing color, day material, night material]
const swatches = [
  ['#6a6254','#6e6258','#453e3c'], // outlines
  ['#be9166','#b8895f','#765a45'],['#d9b183','#d6ad7b','#987653'],
  ['#ead0a3','#d6ad7b','#84684f'],['#9e795a','#997052','#614b3d'],
  ['#f1ead4','#f2e9da','#bdac94'],['#47554e','#535e68','#343d49'],
  ['#97a48c','#94a6af','#64717e'],['#b6bea1','#bac8cd','#85909a'],
  ['#718d58','#708a62','#586b53'],['#9cad72','#9eb37e','#809366'],
  ['#506d46','#526e49','#3e5143'],['#b67e60','#b7795a','#94684e'],
  // Plaster, trim, and cutaway wall edges: no green cast.
  ['#dce1c5','#f2e9da','#343d4a'],['#edf0d9','#fff6e9','#59616d'],
  ['#a3ad94','#c3b8a7','#46505e'],['#a9b399','#d6caba','#424c5a'],
  ['#c9d2b5','#e4d9c9','#56606e'],['#82937b','#a79886','#2c3542'],
  ['#cbd3b7','#e3d7c6','#3e4856'],['#b7bea4','#d5c8b6','#485363'],
  ['#d6dcc0','#efe4d3','#67717c'],['#bdac8d','#b49a7e','#64503f'],
  ['#a3b093','#c6bba9','#414d5c'],['#c4cdae','#e1d5c2','#66707d'],
  ['#b7c1a6','#d4c8b7','#59616d'],['#e0e2c8','#f7eede','#7b7d81'],
  ['#95a58a','#b2a493','#3e4856'],
  // Floor and entry step.
  ['#e3cfac','#d8b98f','#66513f'],['#cdb994','#b99770','#503f34'],
  ['#efdcbb','#e9cea5','#816953'],['#dcc6a0','#cbae84','#5f4b3b'],
  ['#ead6b2','#e0c397','#735b45'],['#c9b38c','#b99b77','#574636'],
  ['#dfcba4','#d7b88e','#82674d'],['#ead7b1','#e6cba5','#937554'],
  // Work rug is blue-gray; lounge rug is sand in daylight, slate at night.
  ['#adb9a1','#aabbc2','#596775'],['#99aa91','#899eaa','#455462'],
  ['#c5cdb5','#d0dbe0','#87939e'],['#c4ccb1','#c3d1d6','#6b7c8a'],
  ['#9fab94','#97abb5','#4e5d6b'],['#c8cfb5','#cfdae0','#8c99a4'],
  ['#e1d6b6','#e4d2b5','#68717b'],['#c1b99c','#bfa787','#4e5966'],
  ['#f1e7ca','#f5e6cc','#929ba5'],['#c8c5a5','#c5ae8e','#7d8690'],
  ['#c1b994','#bca382','#535f6d'],['#f0e4c5','#f4e5cd','#9da3ab'],
  // Upholstery, formerly sage, keeps the same shape and stitch details.
  ['#839687','#8196a3','#566575'],['#a7a98b','#a5a4a0','#757878'],
  ['#adbaa1','#b3c3cd','#7d8c99'],['#b6c1ab','#c5d3d8','#8995a0'],
  ['#6d8272','#637c8c','#414f61'],
  ['#bc8066','#b96f5c','#865b50'],['#d69c7e','#d7836e','#af7967'],
  ['#e6b799','#eba68b','#c3947d'],['#c78b70','#c77864','#985f53'],
  ['#deaa8b','#df957c','#b8806c'],['#bf856b','#b76858','#814e47'],
  ['#edbea0','#f1b499','#d4a18a'],['#ce9679','#c87b65','#996052'],
  ['#d39778','#d58a72','#a77362'],['#e7b28e','#f0af91','#c9967b'],
  ['#ad755e','#9e5e50','#734a43'],['#9baa8d','#829faf','#5f778a'],
  ['#7e8e73','#637d8f','#445c71'],['#c0c7a6','#b5cad2','#91a7b4'],
  ['#b9a772','#b98d51','#8f714d'],['#d3c390','#d8b16d','#bd985e'],
  ['#dacb9a','#e1c08a','#b99a6b'],['#c2b27d','#c5a163','#a28559'],
  ['#a99b6c','#a7824d','#745d43'],['#efe0b1','#f1d6a4','#d4b37b'],
  // Coffee bar and small objects become neutral/slate, not green furniture.
  ['#a2aa8e','#8e9ca6','#4d5969'],['#bcc2a7','#b9c2c6','#6f7c8a'],
  ['#8f987f','#6e808d','#3e4c5f'],['#646e61','#5c6370','#39434f'],
  ['#919c87','#909ca7','#6a7785'],['#394f48','#454f5b','#293744'],
  ['#7e9885','#7898aa','#718da1'],['#a9b8a0','#b7bdbe','#8b9094'],
  ['#b8bba1','#b7b6ad','#88857d'],['#898c74','#858177','#5f5d58'],
  ['#819c85','#7898aa','#657f91'],['#829984','#7898aa','#657f91'],
  ['#7d9786','#7898aa','#657f91'],['#789a8c','#829dad','#6d8796'],
  ['#727b68','#747a80','#4b5663'],['#a3a991','#aab1b6','#7b8893'],
  ['#59665b','#515d69','#364758'],
  // Screen housings and readable, softly lit displays.
  ['#a8b09c','#a3afb4','#6f7e8b'],['#9ba68f','#8396a1','#526576'],
  ['#737b6b','#727e88','#546170'],['#9cbdba','#96bfcc','#83b6c5'],
  ['#c5d6c8','#d1e1e3','#b4d8dc'],['#729790','#6895a9','#588a9e'],
  ['#b4bdab','#b8c4cd','#909da9'],['#61877e','#4d7d96','#52778e'],
  ['#587b75','#486b82','#365c73'],['#aec2a5','#c2d5d9','#b1d4d8'],
  ['#cfdbc3','#dce6e6','#c7e2e1'],['#9baf9c','#8ba9bb','#769bae'],
  ['#6a956f','#7898aa','#557d94'],['#c6ceae','#bcd1d8','#b0cdd3'],
  ['#769888','#759bad','#699db3'],['#d6d7bf','#d9d9d3','#a1adb5'],
  ['#929c8c','#8e99a0','#64727f'],['#a6ae9b','#b0b9bf','#8195a2'],
  ['#9eaa97','#99a5ae','#738493'],['#e3dfcb','#e7e1d6','#bcc5c7'],
  ['#f5e4bc','#efd0a1','#b99a72'],['#dbc297','#cba575','#947553'],
  ['#e0c393','#ddb989','#9a7a56'],
  // View outside and window frames. Night silhouettes are blue, not green.
  ['#a1c0b8','#7e9ead','#243c54'],['#c4d9ce','#b9d2db','#314c68'],
  ['#a1bba0','#a3b697','#2f455b'],['#90ac91','#839c75','#2c4056'],
  ['#829f80','#708a62','#26394d'],['#a8bd9c','#b1c39a','#3d5369'],
  ['#819f84','#789069','#293f55'],['#e2ede0','#e8eff0','#4f6d85'],
  ['#e5e5cd','#f8edda','#7a8089'],['#e6e7d2','#f6e9d5','#8b8c92'],
  ['#efe5c8','#e6d3b6','#72757c'],['#b9b298','#ae9880','#494f5d'],
  ['#f7edd6','#fff1d9','#969394'],
  // Clothing and faces use their original drawing; neutral wardrobe, role pins.
  ['#565a52','#59616a','#404b5c'],['#858878','#91999d','#737f8e'],
  ['#454941','#494e57','#343e4c'],['#616f60','#6d7780','#505f70'],
  ['#665e50','#6e6258','#534845'],['#b3b197','#bdb8ad','#8e8f8d'],
  ['#c9c6ad','#dfd9ce','#b4b7b5'],
  // Existing labels / selection markers.
  ['#f3edd7','#fff0cd','#d2ae75'],['#faf1ca','#fff2d3','#ecc17e'],
  ['#f9f0ce','#fff3d9','#ecc17e'],
];
const lookup = new Map(swatches.map(([source,day,night])=>[source,{day,night}]));
// Daylight balance for plaster and the work rug only. The original day swatches
// remain the material reference for night lamps, preserving that authored mood.
const DAY_SURFACES = {
  '#dce1c5':'#eeebe4', '#edf0d9':'#faf7f1',
  '#a3ad94':'#c0bbae', '#a9b399':'#d3cfc5',
  '#c9d2b5':'#e1ddd3', '#82937b':'#a49e92',
  '#cbd3b7':'#e0dbd0', '#b7bea4':'#d2cdc2',
  '#d6dcc0':'#ece8df', '#a3b093':'#c3beb2',
  '#c4cdae':'#ded9ce', '#b7c1a6':'#d1cdc3',
  '#e0e2c8':'#f4f0e8', '#95a58a':'#afa99d',
  '#adb9a1':'#a0b4c4', '#99aa91':'#819bad',
  '#c5cdb5':'#cad9e2', '#c4ccb1':'#bdcfdb',
  '#9fab94':'#8fa8ba', '#c8cfb5':'#c9d8e2',
};
const cache = new Map();

export function colorFor(mood, color, character=false) {
  const materialMood=mood==='material'?'day':mood;
  const palette=PALETTES[materialMood];
  if (palette[color]) return palette[color];
  const key=`${mood}:${color}:${character}`;
  if (cache.has(key)) return cache.get(key);
  const rgb=color.slice(0,7).toLowerCase(),alpha=color.slice(7);
  let result=(mood==='day'&&DAY_SURFACES[rgb])||lookup.get(rgb)?.[materialMood];
  if (!result && mood==='night') {
    // Only secondary art details use this ambient response. Primary materials,
    // windows, foliage, lamps, screens and all role colors are authored above.
    const channels=[1,3,5].map(i=>parseInt(rgb.slice(i,i+2),16));
    const factors=character?[.76,.75,.75]:[.60,.57,.57];
    result='#'+channels.map((v,i)=>Math.round(v*factors[i]+[7,9,15][i]).toString(16).padStart(2,'0')).join('');
  }
  result=(result||rgb)+alpha;cache.set(key,result);return result;
}
