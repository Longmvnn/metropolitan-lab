export const courses = ['UP 406','UP 417'];
// Only real configuration is seeded: the semester settings and the timetable supplied by the lecturers.
// Lessons, theory notes and assessments are created by lecturers; nothing is invented here.
export const seed = [
 {id:'settings',kind:'settings',data:{title:'Semester I',start:'',weeks:15,expectedStudents:59,coursework406:'',coursework417:'',approved:false,policy:'Assessment weights must be configured from the approved course scheme. No institutional percentages are assumed.'}},
 ...[['Tuesday','13:30','15:30'],['Tuesday','15:40','17:40'],['Tuesday','17:50','19:50'],['Wednesday','07:00','09:00'],['Wednesday','09:10','11:10'],['Wednesday','11:20','13:20'],['Wednesday','17:50','19:50']].map((a,i)=>({id:`timetable-${i}`,kind:'timetable',data:{course:i===6?'UP 406':'UP 417',day:a[0],start:a[1],end:a[2],room:i===6?'RM 70':'RM 22',lecturers:i===6?'Butungo':'Butungo and Evans'}}))
];
// Ids of placeholder records seeded by earlier versions. They are removed if a lecturer never edited them.
export const retiredSeedIds=[...Array.from({length:8},(_,i)=>`lesson-${i}`),...Array.from({length:5},(_,i)=>`theory-${i}`),...Array.from({length:6},(_,i)=>`assessment-${i}`)];
