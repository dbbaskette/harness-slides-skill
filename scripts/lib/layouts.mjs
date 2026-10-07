export const recipes=[
 {id:'comparison',relationship:'compare',useWhen:'Compare two alternatives against the same criteria',fields:['title','left title/body','right title/body'],pattern:'Two equal editable cards with parallel headings; keep units and scales comparable'},
 {id:'process',relationship:'sequence',useWhen:'Explain a flow of three or four steps',fields:['title','steps'],pattern:'Native labeled nodes connected by editable arrows; preserve actual direction and dependencies'},
 {id:'pillars',relationship:'group',useWhen:'Show three or four parallel themes',fields:['title','pillars'],pattern:'Equal cards with one concept and supporting phrase each; approved icons when meaningful'},
 {id:'timeline',relationship:'time',useWhen:'Describe milestones with dates',fields:['title','milestones'],pattern:'Ordered milestones on an editable line; chronological spacing when dates imply intervals'},
 {id:'architecture',relationship:'layers',useWhen:'Explain components, layers and interfaces',fields:['title','layers','relationships'],pattern:'Native grouped shapes and connectors; labels clarify dependencies rather than decorative arrows'},
 {id:'metric',relationship:'evidence',useWhen:'Lead with one important number',fields:['title','metric','unit','context','source'],pattern:'Large editable number with unit, period and qualification; keep interpretation nearby'},
 {id:'chart',relationship:'evidence',useWhen:'Compare measured categories or show a trend',fields:['title','series','units','source'],pattern:'Native chart data with direct labels; Google uses linked Sheets charts'},
 {id:'quote',relationship:'voice',useWhen:'Present an attributed statement',fields:['quote','speaker','source'],pattern:'Readable quote, clear attribution, intentional emphasis and optional authorized portrait'},
 {id:'annotated-image',relationship:'explain',useWhen:'Explain a screenshot or product surface',fields:['title','image','callouts'],pattern:'Authorized image with native numbered labels and connectors; avoid obscuring evidence'},
 {id:'matrix',relationship:'compare',useWhen:'Compare several items on shared criteria',fields:['title','rows'],pattern:'Editable table with readable headers; consistent numeric units and precision'},
];
export function searchRecipes({query='',limit=3,id}={}) {
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Limit must be 1–20');
 if(id){const recipe=recipes.find(r=>r.id===id);if(!recipe)throw new Error('Unknown recipe');return [recipe];}
 const terms=query.toLowerCase().split(/\W+/).filter(Boolean);
 return recipes.map(r=>({r,score:terms.filter(t=>JSON.stringify(r).toLowerCase().includes(t)).length})).filter(x=>!terms.length||x.score).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.r);
}
