// Example work for this visual prototype. No tasks are submitted or executed.
// The desk's owner is the link between a world object and its contextual UI.
export const FOCUS = {
  planner:{title:'Shape the next small release',state:'Planning',summary:'Turn the team’s ideas into a focused plan for the next iteration.',steps:[['Gather the team’s observations',true],['Choose a small, clear scope',false],['Share the plan with Theo',false]]},
  worker:{title:'Bring the first draft to life',state:'In progress',summary:'Work through the plan, one useful detail at a time.',steps:[['Read through the plan',true],['Put together a first draft',false],['Leave notes for Jules',false]]},
  reviewer:{title:'Give the draft a fresh look',state:'Reviewing',summary:'Check the small details and leave a thoughtful second opinion.',steps:[['Read the brief',true],['Review the latest draft',false],['Share a few clear suggestions',false]]},
  human:{title:'Make yourself at home',state:'Your workspace',summary:'Explore the studio, catch up with the team, and find your place in the work.',steps:[['Meet the people in the studio',false],['Take a look at their desks',false],['Settle in at your own desk',false]]},
};
