import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = 'C:/Users/Given/OneDrive/Desktop/My Webs/Research Team Website';
const buildDir = path.join(workspaceDir, '.codex-presentation-build');
const assetsDir = path.join(buildDir, 'assets');
const outputDir = path.join(workspaceDir, 'outputs', 'bea-website-support-presentation');
const finalPath = path.join(outputDir, 'BEA Research Team Website Support Presentation.pptx');
const draftPath = path.join(buildDir, 'candidate.pptx');
const montagePath = path.join(buildDir, 'deck-montage.webp');
const skillDir = 'C:/Users/Given/.codex/plugins/cache/openai-primary-runtime/presentations/26.1116.12020/skills/presentations';
const artifactModule = 'C:/Users/Given/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const { Presentation, PresentationFile } = await import(pathToFileURL(artifactModule).href);
console.log('Artifact Tool loaded');

const W = 1280;
const H = 720;
const C = {
  ink: '#11202E',
  green: '#164E48',
  moss: '#779B5B',
  gold: '#E3B756',
  cream: '#F8F6EF',
  paper: '#FFFDF8',
  line: '#D9DED4',
  muted: '#60716D',
  white: '#FFFFFF',
};
const F = { serif: 'Georgia', sans: 'Arial' };

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(assetsDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
if (await fs.stat(finalPath).catch(() => null)) {
  throw new Error(`Refusing to overwrite existing presentation: ${finalPath}`);
}

const site = JSON.parse(await fs.readFile(path.join(workspaceDir, 'site-content.json'), 'utf8'));
const logoBytes = new Uint8Array(await fs.readFile(path.join(workspaceDir, site.profile.logo)));

function imageBytes(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i.exec(dataUrl || '');
  if (!match) throw new Error('Expected an embedded site image data URL.');
  return { bytes: new Uint8Array(Buffer.from(match[2], 'base64')), type: match[1] };
}

const assets = {};
for (const key of ['home', 'research', 'news', 'team', 'events', 'gallery']) {
  const source = key === 'home' ? site.profile.heroImage : site.pageBackgrounds[key];
  if (!source) continue;
  const img = imageBytes(source);
  assets[key] = img;
  await fs.writeFile(path.join(assetsDir, `${key}.${img.type.split('/')[1] === 'jpeg' ? 'jpg' : img.type.split('/')[1]}`), img.bytes);
}
await fs.writeFile(path.join(assetsDir, 'bea-logo.jpg'), logoBytes);
console.log('Website images prepared');

const presentation = Presentation.create({ slideSize: { width: W, height: H } });
console.log('Presentation created');

function rect(slide, left, top, width, height, fill, name = 'color-field') {
  return slide.shapes.add({
    geometry: 'rect', name,
    position: { left, top, width, height },
    fill,
    line: { style: 'solid', fill: 'none', width: 0 },
  });
}

function text(slide, content, left, top, width, height, opts = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    name: opts.name || 'editable-copy',
    position: { left, top, width, height },
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  });
  shape.text = content;
  shape.text.style = {
    typeface: opts.font || F.sans,
    fontSize: opts.size || '20pt',
    color: opts.color || C.ink,
    bold: Boolean(opts.bold),
    italic: Boolean(opts.italic),
    alignment: opts.align || 'left',
    verticalAlignment: opts.valign || 'top',
    autoFit: 'shrinkText',
    wrap: 'square',
    insets: 0,
  };
  return shape;
}

function addPhoto(slide, image, alt, left, top, width, height, fit = 'cover') {
  return slide.images.add({
    blob: image.bytes,
    contentType: image.type,
    alt,
    fit,
    position: { left, top, width, height },
  });
}

function addLogo(slide, left, top, width = 116, height = 66) {
  return slide.images.add({
    blob: logoBytes,
    contentType: 'image/jpeg',
    alt: 'Bunda Economics Association logo',
    fit: 'contain',
    position: { left, top, width, height },
  });
}

function addTitle(slide, title, subtitle = '') {
  text(slide, title, 76, 66, 900, 72, { font: F.serif, size: '34pt', color: C.ink, name: 'slide-title' });
  if (subtitle) text(slide, subtitle, 78, 148, 1020, 46, { size: '18pt', color: C.muted, name: 'slide-subtitle' });
  rect(slide, 78, 210, 56, 4, C.gold, 'gold-accent');
}

function note(slide, body, sources = 'Sources: project README.md and current site content in site-content.json.') {
  slide.speakerNotes.text = `${body}\n\n${sources}`;
}

// 1 — Cover
{
  const slide = presentation.slides.add();
  slide.background.fill = C.green;
  addPhoto(slide, assets.home, 'Homepage cover photograph currently used on the BEA website', 580, 0, 700, H);
  rect(slide, 0, 0, 580, H, C.green, 'brand-green-cover-field');
  addLogo(slide, 74, 54, 154, 90);
  text(slide, 'BEA RESEARCH TEAM', 78, 194, 420, 34, { size: '14pt', bold: true, color: C.gold, name: 'cover-eyebrow' });
  text(slide, 'A digital home for research,\npeople and participation', 76, 244, 475, 194, { font: F.serif, size: '40pt', color: C.white, name: 'cover-title' });
  text(slide, 'A partnership proposal for institutions and centres', 80, 468, 425, 68, { size: '20pt', color: C.white, name: 'cover-subtitle' });
  text(slide, 'Developed by Given Mkwara  ·  DataPro Solutions', 80, 638, 430, 28, { size: '12pt', color: '#D8E5DB', name: 'developer-credit' });
  note(slide, 'Introduce the BEA Research Team website as a working platform for sharing the team’s research and activity, handling enquiries, maintaining public information and supporting member elections.', 'Source: website profile and homepage image in site-content.json.');
}

// 2 — Purpose and value
{
  const slide = presentation.slides.add();
  slide.background.fill = C.cream;
  addTitle(slide, 'A shared platform for the team', 'One dependable place to publish work, keep information current and invite participation.');
  text(slide, 'For visitors', 80, 260, 440, 42, { size: '15pt', bold: true, color: C.moss });
  text(slide, 'Find research, news, events, people and ways to contact the team.', 80, 304, 470, 86, { font: F.serif, size: '26pt', color: C.ink });
  text(slide, 'For administrators', 80, 432, 440, 42, { size: '15pt', bold: true, color: C.moss });
  text(slide, 'Update the site through a protected panel instead of editing every page by hand.', 80, 474, 470, 96, { font: F.serif, size: '26pt', color: C.ink });
  addPhoto(slide, assets.research, 'Blurred research page background photo currently used on the website', 650, 252, 548, 348);
  rect(slide, 650, 596, 548, 6, C.green, 'image-caption-rule');
  text(slide, 'Research page background from the live site', 650, 614, 540, 30, { size: '12pt', color: C.muted });
  note(slide, 'Explain the two connected audiences: visitors who need a clear public home, and administrators who need a manageable way to keep content updated.');
}

// 3 — Public-facing site
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  addTitle(slide, 'What visitors can explore', 'The public site brings the team’s work and identity together.');
  addPhoto(slide, assets.gallery, 'Gallery page background photo currently used on the website', 76, 252, 510, 370);
  const items = [
    ['Research', 'Projects, publications and updates'],
    ['News & events', 'Stories, training and activities'],
    ['People', 'Executive roles and team profiles'],
    ['Gallery', 'Photos from research and team life'],
  ];
  items.forEach((item, i) => {
    const y = 262 + i * 84;
    text(slide, item[0], 658, y, 235, 34, { font: F.serif, size: '21pt', color: C.ink });
    text(slide, item[1], 900, y + 3, 300, 45, { size: '15pt', color: C.muted });
    if (i < items.length - 1) rect(slide, 658, y + 55, 535, 1, C.line, `section-rule-${i}`);
  });
  note(slide, 'Walk through the visitor-facing areas shown in the website navigation and public pages. The photo is the gallery page background stored in the site content.');
}

// 4 — Research and news
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  addPhoto(slide, assets.news, 'News page background photo currently used on the website', 0, 0, 538, H);
  rect(slide, 538, 0, 742, H, C.ink, 'news-text-field');
  text(slide, 'VISIBLE WORK', 604, 82, 460, 30, { size: '13pt', bold: true, color: C.gold });
  text(slide, 'Research, stories\nand activities', 600, 130, 590, 122, { font: F.serif, size: '36pt', color: C.white });
  text(slide, 'Examples already listed on the site', 604, 294, 560, 30, { size: '14pt', color: '#B7C9C1' });
  const examples = [
    'Resilient value chains for smallholder agriculture',
    'LUANAR takes it home',
    'Learning by doing: our research tools approach',
    'First Year’s Orientation Week',
  ];
  examples.forEach((value, i) => {
    const y = 354 + i * 69;
    rect(slide, 604, y + 10, 7, 7, C.gold, `bullet-${i}`);
    text(slide, value, 632, y, 568, 47, { size: '17pt', color: C.white });
    if (i < examples.length - 1) rect(slide, 632, y + 50, 556, 1, '#44515B', `example-rule-${i}`);
  });
  note(slide, 'Use the listed stories and projects as examples of content currently represented in the website. Do not imply that these items measure reach or impact.', 'Source: news, research and events arrays in site-content.json.');
}

// 5 — People and team
{
  const slide = presentation.slides.add();
  slide.background.fill = C.cream;
  addPhoto(slide, assets.team, 'Team page background photo currently used on the website', 742, 0, 538, H);
  rect(slide, 0, 0, 742, H, C.cream, 'team-text-field');
  text(slide, 'PEOPLE & LEADERSHIP', 78, 68, 500, 30, { size: '13pt', bold: true, color: C.moss });
  text(slide, 'Make the team\nvisible', 76, 116, 560, 118, { font: F.serif, size: '37pt', color: C.ink });
  text(slide, 'The public team page presents executive roles and responsibilities. The admin panel can update role details and add member photos.', 80, 272, 565, 100, { size: '18pt', color: C.muted });
  text(slide, 'Director  ·  Project Coordinators  ·  Data & Training Lead\nWriting Section Lead  ·  Public Relations Officer  ·  Treasurer & Secretary', 80, 412, 588, 82, { size: '15pt', color: C.ink });
  text(slide, 'A useful base for keeping leadership information current as the team changes.', 80, 556, 580, 54, { font: F.serif, size: '18pt', italic: true, color: C.green });
  note(slide, 'The website lists six executive roles. The admin tools support changing team content and uploading photos for executive positions.');
}

// 6 — Admin capability
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  addTitle(slide, 'A manageable site behind the scenes', 'Authorised administrators can keep public information up to date.');
  addPhoto(slide, assets.events, 'Events page background photo currently used on the website', 794, 252, 404, 360);
  const leftCopy = [
    'Edit the main profile and homepage information',
    'Add or update research, news, events and gallery items',
    'Manage team roles and member photos',
    'Upload blurred backgrounds for individual pages',
    'Restore deleted items from Trash, or remove them permanently',
  ];
  leftCopy.forEach((line, i) => {
    const y = 254 + i * 69;
    text(slide, `0${i + 1}`, 82, y, 48, 30, { size: '13pt', bold: true, color: C.moss });
    text(slide, line, 138, y - 2, 594, 55, { size: '17pt', color: C.ink });
    if (i < leftCopy.length - 1) rect(slide, 138, y + 50, 586, 1, C.line, `admin-rule-${i}`);
  });
  text(slide, 'Updates are saved to the site’s content store and appear on the public pages.', 82, 630, 650, 32, { size: '13pt', color: C.muted });
  note(slide, 'Describe the current admin scope. The admin panel itself could not be captured as a browser screenshot during this task; this slide describes its implemented functions.');
}

// 7 — Enquiries
{
  const slide = presentation.slides.add();
  slide.background.fill = C.green;
  text(slide, 'ENQUIRIES', 78, 70, 380, 30, { size: '13pt', bold: true, color: C.gold });
  text(slide, 'A direct route\ninto conversation', 76, 116, 490, 126, { font: F.serif, size: '37pt', color: C.white });
  text(slide, 'Visitors can send a question through the website. Administrators can review it in the admin panel and reply by email through Brevo when the service is configured.', 80, 292, 468, 144, { size: '19pt', color: '#E1ECE5' });
  text(slide, 'Visitor sends enquiry', 638, 178, 510, 42, { font: F.serif, size: '23pt', color: C.white, align: 'center' });
  rect(slide, 876, 232, 4, 58, C.gold, 'flow-connector-1');
  text(slide, 'Enquiry appears for administrators', 638, 310, 510, 50, { font: F.serif, size: '21pt', color: C.white, align: 'center' });
  rect(slide, 876, 374, 4, 58, C.gold, 'flow-connector-2');
  text(slide, 'Reply to the sender by email', 638, 454, 510, 46, { font: F.serif, size: '21pt', color: C.white, align: 'center' });
  text(slide, 'Brevo API credentials and a verified sender are required for outgoing replies.', 648, 548, 490, 48, { size: '13pt', color: '#C9DCD2', align: 'center' });
  note(slide, 'Explain the existing enquiry flow and that Brevo is an external service which must be configured with a valid API key and verified sender email before replies can be delivered.', 'Sources: Contact inquiries and Brevo replies section in README.md; inquiries tools in server.js and admin.js.');
}

// 8 — Voting
{
  const slide = presentation.slides.add();
  slide.background.fill = C.cream;
  addTitle(slide, 'Online voting for executive elections', 'A member roster and election window support one ballot per eligible member per election.');
  const steps = [
    ['01', 'Maintain the roster', 'Import or update eligible members using a CSV spreadsheet.'],
    ['02', 'Set up the election', 'Add positions and candidates; set opening, closing and quorum rules.'],
    ['03', 'Members sign in', 'Use full name and student registration number.'],
    ['04', 'Cast one ballot', 'The server prevents a second ballot for the same member and election.'],
  ];
  steps.forEach((step, i) => {
    const x = 78 + i * 300;
    text(slide, step[0], x, 280, 70, 42, { size: '17pt', bold: true, color: C.moss });
    rect(slide, x, 330, 244, 2, i === 0 ? C.gold : C.line, `vote-step-rule-${i}`);
    text(slide, step[1], x, 358, 250, 72, { font: F.serif, size: '20pt', color: C.ink });
    text(slide, step[2], x, 446, 248, 112, { size: '15pt', color: C.muted });
  });
  text(slide, 'Election settings should be checked against the current BEA constitution before voting opens.', 80, 624, 1020, 34, { size: '13pt', color: C.green });
  note(slide, 'The website supports roster import, election scheduling, candidate management, configurable quorum and one ballot per eligible member ID per election. Registration numbers are sign-in secrets and should be kept confidential. The system does not replace the constitution.', 'Source: Elections and online voting section in README.md.');
}

// 9 — Value for partners and support requested
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  text(slide, 'WHY PARTNERSHIP MATTERS', 78, 70, 560, 30, { size: '13pt', bold: true, color: C.gold });
  text(slide, 'Help the platform\nserve the team well', 76, 112, 540, 128, { font: F.serif, size: '36pt', color: C.white });
  text(slide, 'A maintained website helps the Research Team keep its work visible, share opportunities and provide a reliable point of contact.', 80, 284, 496, 108, { size: '18pt', color: '#D5DFDD' });
  rect(slide, 650, 92, 2, 520, '#46525A', 'support-divider');
  text(slide, 'FINANCIAL SUPPORT', 704, 116, 442, 32, { size: '13pt', bold: true, color: C.gold });
  text(slide, 'Hosting and domain\nMaintenance and backups\nTraining and future improvements', 704, 168, 454, 154, { font: F.serif, size: '21pt', color: C.white });
  text(slide, 'TECHNICAL SUPPORT', 704, 378, 442, 32, { size: '13pt', bold: true, color: C.gold });
  text(slide, 'Deployment and security guidance\nPersistent storage and recovery\nAdvice, mentoring or implementation help', 704, 430, 460, 154, { font: F.serif, size: '20pt', color: C.white });
  note(slide, 'Make the support request concrete but do not suggest an amount because no budget was provided. The current deployment requires a Node.js host, HTTPS, secrets in the host environment and persistent storage for the site and private records.', 'Source: Hosting section in README.md.');
}

// 10 — Close / partnership next step
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  addLogo(slide, 82, 58, 142, 82);
  text(slide, 'Support a platform\nthat keeps BEA connected', 78, 188, 840, 136, { font: F.serif, size: '39pt', color: C.ink });
  text(slide, 'We invite institutions and centres to discuss a financial or technical partnership that keeps the website dependable and helps it grow with the Research Team.', 82, 374, 910, 102, { size: '20pt', color: C.muted });
  rect(slide, 82, 526, 1116, 3, C.gold, 'closing-rule');
  text(slide, 'BEA Research Team  ·  LUANAR, Bunda Campus, Malawi', 82, 554, 570, 32, { size: '14pt', color: C.green });
  text(slide, 'Developed by Given Mkwara  ·  DataPro Solutions', 82, 594, 570, 30, { size: '13pt', color: C.muted });
  text(slide, 'Let’s discuss the right way to support the project.', 720, 578, 478, 42, { font: F.serif, size: '19pt', color: C.ink, align: 'right' });
  note(slide, 'Close by inviting the institution or centre to discuss the kind of support it can provide and to agree on a practical next step.');
}

console.log('Slide content created');
await (await PresentationFile.exportPptx(presentation)).save(draftPath);
console.log('Draft PowerPoint exported');

const finalizerDir = path.join(buildDir, 'sandbox-compatible-finalizer');
await fs.mkdir(finalizerDir, { recursive: true });
await fs.cp(path.join(skillDir, 'container_tools'), finalizerDir, { recursive: true });
const originalFinalizer = await fs.readFile(path.join(skillDir, 'container_tools', 'artifact_tool_utils.mjs'), 'utf8');
const hardLinkPublication = 'await fs.link(stage, finalPath);';
if (!originalFinalizer.includes(hardLinkPublication)) throw new Error('Expected finalizer publication step was not found.');
const compatibleFinalizer = originalFinalizer.replace(
  hardLinkPublication,
  'await fs.copyFile(stage, finalPath, fsConstants.COPYFILE_EXCL);',
);
const localFinalizerPath = path.join(finalizerDir, 'artifact_tool_utils.mjs');
await fs.writeFile(localFinalizerPath, compatibleFinalizer, 'utf8');
await fs.copyFile(path.join(skillDir, 'container_tools', 'runtime_helpers.mjs'), path.join(finalizerDir, 'runtime_helpers.mjs'));
const { finalizePresentation } = await import(pathToFileURL(localFinalizerPath).href);
const stagingDir = path.join(buildDir, 'finalizer-staging');
await fs.mkdir(stagingDir, { recursive: true });
const result = await finalizePresentation({
  workspaceDir,
  candidatePath: draftPath,
  finalPath,
  pythonExecutable: 'C:/Users/Given/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath: path.join(finalizerDir, 'inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(finalizerDir, 'inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: 'design', families: ['Georgia', 'Arial'] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, 'validation.json'),
});
console.log(JSON.stringify({ finalPath, slideCount: presentation.slides.items.length, result }));
