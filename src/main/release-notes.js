// #330: user-facing What's New entries, NEWEST FIRST. Shown once on the first
// launch after an update (see whatsnew:get in main.js). These are read by
// customers — write them in plain product language (what changed for THEM),
// never commit-speak. CHANGELOG.md stays the dev-audience record; this file is
// the curated subset worth announcing.
//
// The "unreleased" entry collects the current batch between cuts. The release
// loop (clipflow-update-launcher skill) renames it to the real version and
// stamps the date at cut time — "unreleased" itself is never shown to users.
//
// Shape: { version, date: "YYYY-MM-DD", added: [], changed: [], fixed: [] }.
// Omit any empty section.
module.exports = [
  {
    version: "unreleased",
    date: "",
    changed: [
      "The yellow tag on a YouTube post whose thumbnail YouTube didn't take now reads \"Auto thumbnail\", because that is what your video shows: YouTube's own automatic pick instead of the frame you chose. Hover the tag to see YouTube's reason.",
    ],
    fixed: [
      "Sending a clip back to the Queue from the editor now clears its old \"720p\" tag, the same way it clears old failures. The tag from its last Instagram post used to stay on the clip and show up on the next post, even when that post went out at full size.",
      "The clip player on the Projects tab, the video previews in the editor's Media tab and the audio track window now shut their video down when you close them. Before, the video could stay open in the background and keep the file busy.",
    ],
  },
  {
    version: "0.5.0-alpha.11",
    date: "2026-09-20",
    added: [
      "Pick the thumbnail for your YouTube Shorts. Open a rendered clip in the Queue and scroll to the bottom of its YouTube card: under Tags there is a new Thumbnail slider with a small preview of your clip. Drag it to the frame you want and let go, and it is saved. Leave it alone and the thumbnail is the first frame of your video. \"Reset to first frame\" takes you back to that.",
      "Right after a clip uploads to YouTube, Corva sets the frame you picked as its thumbnail, captions and subtitles included. It happens for scheduled posts, Post now and Retry, and you do not need to reconnect your YouTube account. The thumbnail shows on your channel page, in search and on the homepage. YouTube opened custom thumbnails for Shorts in July 2026, starting with channels in its Partner Program.",
      "If YouTube does not accept the thumbnail, your clip still posts and still counts as sent. A yellow \"Auto thumbnail\" tag appears next to YouTube on that clip, in its Posted panel and on its row in the Published shelf, and hovering the tag tells you why.",
    ],
  },
  {
    version: "0.5.0-alpha.10",
    date: "2026-09-19",
    changed: [
      "A Day or Pt number you set by hand on the Rename tab now stays put when other recordings show up or the list renumbers itself. The rest number around it.",
    ],
    fixed: [
      "The Rename tab could give your recordings part numbers out of order after you restarted Corva, for example proposing a later recording as Pt1 and the real first one as Pt2. Part numbers now always follow the time in the filename, so the earliest recording is Pt1.",
      "Two different days of the same game could be proposed with the same Day number. Days now count up in date order.",
    ],
  },
  {
    version: "0.5.0-alpha.9",
    date: "2026-09-18",
    added: [
      "Screenshot just the gameplay or just your camera. The small arrow next to the screenshot button in the viewer gives you \"Gameplay only\" and \"Camera only\": that part of your layout, at full sharpness, with no subtitles or captions on it. The camera button on its own still saves the whole frame.",
      "After a screenshot, the message that pops up lets you crop it, add it to the Media tab (filed under the clip's game), or put it straight on your clip at the playhead.",
      "Crop any picture in the Media tab: hover it and click the crop icon. Drag the box or pick a shape (square, 16:9, 9:16 or 4:5). The crop is saved as a new picture and the original stays as it was.",
    ],
    changed: [
      "A rendered clip's thumbnail is now the very first frame of the finished video, exactly as it looks when posted.",
      "Screenshots no longer replace each other. Every one you take is kept.",
    ],
    fixed: [
      "After you re-render a clip, its thumbnail updates straight away. It used to keep showing the previous render, old title card and all, until Corva was restarted, so it looked like the new render had not worked.",
      "Clip lengths in the Queue and in the editor's clip switcher now match the video you made. They used to show the length of the moment Corva first picked, so a clip you cut down to 4 seconds could read 0:30 and one you extended could read shorter than it is. Imported clips showed no length at all.",
      "The warning for a clip that is longer than your TikTok account allows now checks every clip. Before, it only ran on imported clips.",
    ],
  },
  {
    version: "0.5.0-alpha.8",
    date: "2026-09-18",
    changed: [
      "The Layout panel opens on \"This section\" when your clip has cuts, and clicking a section on the timeline switches to it, so trying a layout on one section no longer changes the whole clip by accident. \"This clip\" is still one click away and stays picked until you close the panel.",
      "The Layout panel marks which saved layout is in use. \"This section\" tags the one the section under the playhead uses, \"This clip\" the clip's, and the one you are looking at is highlighted. \"Edited\" means that layout has been changed since it was applied, or the saved layout was updated afterwards.",
    ],
    fixed: [
      "Layout changes can be undone. Ctrl+Z takes back applying a saved layout, Apply, Paste and the remove buttons, whether on one section, the whole clip or every clip at once, and Ctrl+Shift+Z brings them back. While you edit a layout, Ctrl+Z steps back one drag or slider move at a time.",
      "Text and buttons in the Layout panel no longer run past its right edge when the panel is narrow.",
      "A scheduled clip could go out twice on every platform. When its time came, Corva posted it in the background while the Queue still showed it as idle, so pressing Post sent it again. A clip that is being posted now shows \"Publishing...\" on its Queue card, with Post and Schedule hidden until it is done. That includes opening Corva while a post is already under way, for example after a restart. And Corva will not send the same clip twice at once, even if Post is pressed.",
    ],
  },
  {
    version: "0.5.0-alpha.7",
    date: "2026-09-17",
    added: [
      "Move the subtitles of one section. Click the subtitle in the preview and pick \"This section\" under it, then drag. Only the subtitles in that part of the timeline move, in the preview and in the export. Handy when you zoom into your camera and the subtitles would cover your face. \"All subtitles\" puts the section back with the rest.",
      "Style several caption words at once. On the word chips under the caption text, Ctrl+click picks extra words and Shift+click picks a run. Colour, font, size, glow, shadow, AA and Reset then apply to all of them, and one Ctrl+Z takes the change back.",
    ],
    changed: [
      "ALL CAPS is now one AA switch, the same one as on each subtitle row. You will find it in the Subtitles toolbar (every subtitle), the Text toolbar (the whole caption) and on the card that opens when you click a word or a caption line. It lights up whenever the words are in capitals, so typing DUDE switches it on by itself.",
      "Switching AA off brings back the spelling you had. \"Cryo\" becomes \"CRYO\" and goes back to \"Cryo\", not \"cryo\". It remembers each word on its own, so you can capitalise a whole line and switch one word back. A word you typed in capitals goes to lowercase, and a lone \"I\" stays capital.",
      "Capitals are no longer saved in templates. They are something you press per clip.",
    ],
    fixed: [
      "If you pressed Generate in AI Tools and opened another clip before it finished, the new titles showed up on the wrong clip. They now stay with the clip you asked for and are waiting there when you go back.",
      "Pressing Apply on an AI caption sometimes said Applied while the caption on the video did not change. This happened after clicking the second caption on a clip that has two. Apply and the caption text box now always change the caption you can see.",
      "Capitalising a caption word showed it in capitals on the video while the text box and the word chip still showed it in lowercase. The text box, the chips, the subtitle rows, the preview and the export now always read the same.",
      "Pressing the lowercase button on a word you had typed in capitals did nothing. The AA switch now lower-cases it.",
      "Clips you capitalised on the previous version look the same after this update, including ones you have not reopened.",
    ],
  },
  {
    version: "0.5.0-alpha.6",
    date: "2026-09-17",
    added: [
      "Select several things on the timeline. Ctrl+click adds or removes a block and Shift+click selects a run, on every lane: subtitles, captions, video sections, sounds and overlays. With sounds or overlays selected, Ctrl+D or Alt+drag copies the whole group, dragging one moves the rest with it, and Delete removes them all. Each is one undo step.",
      "Move one subtitle without moving them all. Select the subtitle box in the preview and switch from \"All subtitles\" to \"This subtitle\" to drag only the line on screen, for the moments your webcam sits where the subtitle would go. A moved line gets a marker in Edit Subtitles; click it to put the line back. The export places it exactly where you did.",
      "The Aa and AB buttons work. AB shows the text in capitals and Aa brings it back exactly as you typed it, so names and acronyms survive. Use the pair in the toolbar for the whole caption or every subtitle, or the pair on a word's card to make just that word or line shout.",
    ],
    changed: [
      "Inside a project, Corva opens the tab you were working in. Coming back from the editor no longer resets the clip list to All, and the clip you just edited is scrolled into view.",
      "Captions start with tighter line spacing (0.9 instead of 1.3), including saved templates that were still on the old default. A spacing you chose yourself is left alone.",
      "The small AA button on a subtitle row no longer rewrites your text, so switching it off no longer lower-cases everything.",
    ],
    fixed: [
      "With a different layout on each side of a cut, playback could flash one frame in the wrong layout. It no longer does, and parking the playhead exactly on a cut now shows the first frame of the part that starts there. Exports were never affected.",
      "The project name, back button and All / Pending / Approved tabs stay pinned while you scroll inside a project, and so does the Queue's header.",
      "TikTok privacy no longer appears to reset from \"Public\" to \"Select privacy\" just after you open an unscheduled clip. Nothing was being reset; the card was growing and pushing a different row into view. It now opens fully formed.",
      "A switched-off subtitle line stays off when you change the subtitle grouping.",
    ],
  },
  {
    version: "0.5.0-alpha.5",
    date: "2026-09-16",
    added: [
      "A new switch under Settings → AI & Style: \"Generate titles and captions when I approve a clip\". Turn it on and the six cards are waiting in the editor by the time you open an approved clip. One generation per clip, and the title stays as it is until you pick a card. It is off until you choose it.",
      "Titles and captions are remembered. The cards you generated for a clip are saved with it, so closing Corva and coming back tomorrow shows the same cards instead of charging you again.",
      "A scheduled clip in the Queue now shows the captions it will post with, the same block an unscheduled clip shows, and you can fix a caption there without losing the slot.",
    ],
    changed: [
      "Titles and captions write the way you write. The suggestions used to be told to stay in sentence case no matter what your own published titles looked like; now they follow your examples on which word to shout and how many, and \"insane\" is no longer off limits. Captions can carry caps across a line the way yours do.",
      "What you type in the Context box now drives all six cards, not one of them.",
      "The two small buttons on each card, Rephrase and Regenerate, now use the same clip-watching model as Generate, so a regenerated card is grounded in what is on screen.",
      "Title and caption generation is quicker and cheaper: about six seconds and a cent and a half per Generate, down from forty seconds and over two cents.",
      "If Corva ever has to write titles from four still frames instead of watching the clip, a line under the cards says so.",
      "The Layout panel's edit preview grows with the drawer instead of staying a thumbnail, with the controls beside it when there is room.",
    ],
    fixed: [
      "A render is only marked done when the finished file checks out: it has picture and sound and runs the length of your timeline. A file that comes out short or empty fails the render instead of waiting in the queue to be posted.",
      "A render that stops making progress for five minutes is stopped and reported instead of holding every render behind it.",
      "Recordings captured in 10-bit HDR now render without an encoder error.",
    ],
  },
  {
    version: "0.5.0-alpha.4",
    date: "2026-09-13",
    added: [
      "Two kinds of zoom on a layout box. Drag a corner to make the webcam or game band bigger, as before, or use the new − and + on each box row to tighten or widen the crop without moving anything else.",
      "Saved layouts can be duplicated and deleted from the Layout panel, and a row shows an Apply chip when you hover it, so it is clear that clicking a layout applies it to the section or clip you are on.",
    ],
    changed: [
      "Applying a layout no longer changes your saved layouts. It only sets the section or clip you are editing. To put a change into the library, use \"Save as new…\" or \"Update\" under the Apply button — and you can save as many layouts as you like.",
      "The Layout panel shows the result first when you edit: the preview sits at the top with the Webcam and Game rows right under it, and the background sliders are tucked into a \"Background & edge\" section you open when you need it.",
      "While you edit a layout, playback shows each section's own layout as it passes through your cuts; your in-progress layout shows only where it will land.",
    ],
    fixed: [
      "A video with a transparent background (a ProRes export from DaVinci, for example) now shows its picture in the editor preview and the Media panel. It used to play the sound with nothing visible; the render was always fine.",
      "A brand-new install no longer files every recording as \"Just Chatting\" when no games have been added yet. Until you add a game, recordings read Unknown and the Rename tab says so, with an Add Game button.",
      "If no output folder is set, Corva tells you at launch instead of at Render time, and the Queue no longer offers an import it cannot do.",
    ],
  },
  {
    version: "0.5.0-alpha.3",
    date: "2026-09-10",
    changed: [
      "Clip tiles in Analytics are quieter. The ranking number in the corner and the thin multi-coloured bar under the view count are both gone — the bar split your views by platform at a size too small to read, and the number only repeated the order the clips were already in. Each tile now shows how it did against your median, its length, its title, its views, and the game.",
      "The clip panel drops the \"share\" bar beside each platform. The view count sitting right next to it already said the same thing, more precisely, and losing the bar gives the platform names room to spell themselves out.",
      "\"Copy what worked\" now shows the caption on its own. The title was identical on every platform and already printed at the top of the panel, and the hashtag box was only ever the hashtags lifted back out of the caption above it. Switching platform still swaps the caption, which is the part that genuinely differs between YouTube, Facebook, Instagram and TikTok. Your other clips from the same game are now in view without scrolling.",
    ],
  },
  {
    version: "0.5.0-alpha.2",
    date: "2026-09-10",
    added: [
      "The clip panel in Analytics now opens beside your clips instead of on top of them, so nothing is hidden while it is open. Click anywhere off it to close it, or click another clip to jump straight to that one.",
      "Sort and filter your clips in Analytics: Top, Newest or Oldest, and narrow down to one game, to Main or Variety, or to the clips you posted on a particular platform.",
      "The clip panel shows what each platform actually received. Switch between YouTube, Facebook, Instagram and TikTok to see the title, caption and hashtags exactly as they went out, each with a one-click copy — handy for reusing a title or a tag set that worked.",
      "\"Match text color\", in the Glow section of the Subtitles and Text panels. Turn it on and the glow takes the same colour every time you change a word, a line or the whole caption — one click instead of two.",
    ],
    fixed: [
      "Finishing setup no longer stops on \"Subtitle timing\". One of the subtitle-timing models on our server did not match its fingerprint, so Corva was right to refuse it — the file has been republished and setup now runs through to the end.",
      "The play button on a clip in Analytics plays the clip.",
      "The Analytics clip panel no longer sits under the window's title bar with its close button half hidden.",
      "The colour swatch in the Subtitles panel now changes the subtitle colour. It had been doing nothing at all.",
      "Setup checks there is room for the subtitle-timing models before it starts downloading them, instead of running the drive down and failing part way.",
    ],
  },
  {
    version: "0.5.0-alpha.1",
    date: "2026-09-10",
    added: [
      "The Analytics tab now teaches you what works instead of listing numbers. It opens with your totals and median views per clip, then a few plain-English findings worked out from your own clips (which platform carries your views, whether shouted or hand-written titles do better, the clip length with the best median, and what to repeat), then your clips as a thumbnail grid ranked against your typical clip, with cards for views by game, by who wrote the title, by length, and a day-by-hour map of your best posting slots. The old table is still there, collapsed at the bottom, with a CSV export.",
      "Click any clip in Analytics to open it: the first frame with a play button, the caption exactly as it was posted, how each platform did with a link to the post, other clips from the same game, and buttons to open it in the editor, show the rendered file in Explorer, or open it on YouTube, Facebook, Instagram or TikTok.",
      "Corva now keeps a daily record of every clip's views. From the second day it can show how your views changed against the previous period, a growth line across all platforms, and each clip's day 2, day 7 and now. Until then those spots say the record is still collecting.",
      "TikTok view counts are built in and switch on the moment TikTok approves the app's read permission; a later update will turn them on and ask you to reconnect TikTok once.",
    ],
    fixed: [
      "Connecting Facebook or Instagram works again. Sign-in now returns through a hosted Corva page, which Facebook requires for a live app, so the reconnect no longer stops in the browser with a domain error.",
      "Facebook and Instagram stay connected on their own. Corva renews each sign-in once it is past its halfway point, so opening the app about once a month keeps both platforms live instead of asking you to reconnect every two months.",
      "Pasting a platform key or secret with a stray space no longer breaks the connect; the Save buttons in Settings trim it.",
      "The Analytics tiles no longer show one deleted post's error in place of your counts.",
      "Sign-in flows no longer write account tokens into the log file.",
    ],
  },
  {
    version: "0.4.0-alpha.33",
    date: "2026-09-10",
    added: [
      "A new Analytics tab, between Tracker and Settings. See views per clip across YouTube, Instagram and Facebook, filter by the last 7, 30 or 90 days, sort the table, and see which games and which kind of titles (yours, AI edited, AI as suggested) pull the most views. Counts refresh on their own after launch, or press Refresh.",
      "Instagram and Facebook need one extra permission to share their view counts. Open Settings → Publishing and click \"Reconnect for views\" on each card once; YouTube needs nothing. TikTok views arrive once TikTok approves the app.",
    ],
    changed: [
      "Dim labels read better on every theme. The small hints, timestamps and column headers were lifted a touch on all nine themes, and a few status colours on Sunset and Paper were deepened, so the quiet text is readable without changing the look.",
    ],
  },
  {
    version: "0.4.0-alpha.32",
    date: "2026-09-10",
    added: [
      "One \"Social tags\" line per clip on the Queue card. Type your hashtags once and they land in the TikTok, Instagram and Facebook captions together, for that clip only. It starts from the game's line and becomes the clip's own the moment you edit it, with \"Reset to game tags\" to go back — so you no longer need to touch the game's shared line while working on a single clip.",
    ],
    fixed: [
      "Changing the game's hashtag line no longer rewrites clips you have already scheduled. The moment you schedule a clip, its social hashtags and YouTube tags are copied onto it, so editing the game's defaults for the next clip leaves everything already in the schedule exactly as you set it.",
    ],
    changed: [
      "The Audio panel in the editor now opens where you actually work. It remembers whether you place music or sound effects more often and opens on that lane, and it opens on Recent instead of All — so the sounds you reach for every day are the first thing you see, with no clicking through Music and then Sound effect and then Recent each time.",
    ],
  },
  {
    version: "0.4.0-alpha.31",
    date: "2026-09-09",
    added: [
      "Sunset, a new theme for evenings. It is a light theme turned down: dark text on a soft sandy page with a terracotta accent, for when dark mode is not what you want but Daylight, Paper and Blush are too bright after dark. Pick it in Settings → Appearance.",
      "Edit a YouTube tag without retyping it. In the tag box on the Queue's YouTube card and in Captions & Descriptions, click a tag's text to change just that one — Enter keeps the new spelling, Escape puts the old one back, and clearing it removes the tag.",
      "Undo in the tag box. Ctrl+Z brings back a tag you removed, a Clear all you didn't mean, or an edit you want to reverse, and Ctrl+Y puts it forward again — as far back as when you started editing the list.",
    ],
    changed: [
      "A duplicate tag no longer vanishes without a word. Type or paste a tag that is already in the list and the one already there lights up for a moment, with a line underneath saying so. Editing a tag into a spelling another tag already has is stopped the same way instead of quietly merging the two.",
      "The tabs along the bottom now sit together in the middle instead of being spread across the whole window, so switching from Rename to Settings is a short move rather than a trip from one edge of the screen to the other.",
    ],
  },
  {
    version: "0.4.0-alpha.30",
    date: "2026-09-07",
    added: [
      "Two new reasons for turning a clip down. \"Didn't stand alone\" is for a moment that worked live but doesn't hold up as a short on its own — by far the reason you were most often typing out by hand. \"No payoff\" is for a clip that builds but never lands its ending.",
      "\"Just sounded angry\" is now its own reason, separate from \"Fell flat\". They are opposite problems: one is a reaction with no energy behind it, the other is saying exactly the right thing in the wrong tone.",
    ],
    changed: [
      "Turning a clip down for the way you said it no longer teaches Corva to avoid your words. When you reject a clip because the reaction fell flat or came out angry, the problem is the delivery — not what you actually said. Corva was still being shown that clip's words as an example of what to skip, and since your catchphrases turn up just as often in the clips you keep, it was quietly learning to avoid the phrases that mark your best work. Reasons about delivery now stay out of that completely, while the rest of a rejection still teaches normally.",
      "The reasons you can pick now match the kind of creator you told Corva you are. In Settings → AI Preferences you rank what Corva should look for; the reasons for turning a clip down now mirror that ranking. Put funny first and you are asked whether a clip was funny; put educational first and you are asked whether it taught anything. React shows also get \"Reaction added nothing\", for when the moment you were reacting to carried the clip and your reaction didn't add to it.",
    ],
  },
  {
    version: "0.4.0-alpha.29",
    date: "2026-09-07",
    changed: [
      "Your week now starts on Sunday. The Tracker calendar used to open on Monday and leave Sunday stranded at the far right; Sunday now sits first and the week runs through to Saturday. This moves the week itself, not just the columns \u2014 the goal count, the pace ring, the streak and the XP for a week you hit are all counted over the new Sunday-to-Saturday window, and your existing weeks move across with them on first launch. Nothing you have already posted changes, and no week you hit becomes a week you missed. If you post Monday to Saturday, the week now ends on your last posting day instead of running one dead day past it.",
      "Step through weeks from either side of the calendar. Tall arrows now run down the left and right edges of the week log, so you can move a week back or forward from wherever you are in the grid instead of going back up to the small arrows in the header. Those are still there, next to the dates and \"Back to this week\".",
    ],
    fixed: [
      "A reposted clip shows its posting time again. On the week log, a card marked as a repost was wide enough to push its own time off the right edge \u2014 \"1:30p\" showed as \"1:3\" and the little dot that says whether it went out automatically disappeared entirely. The repost mark is now a small \u21bb symbol instead of the word, and the time is protected so it can never be the thing that gets squeezed out.",
      "A subtitle line you switched off no longer appears in the finished video. Turning a line off worked when you rendered from inside the editor, but \"Render All\" from Projects and any queued render put it straight back.",
      "View counts from YouTube can be collected again. The lookup was searching for accounts under the wrong name and quietly finding nothing every time, so nothing that ranks your titles by how they actually performed has ever had data to work with.",
    ],
  },
  {
    version: "0.4.0-alpha.28",
    date: "2026-09-07",
    added: [
      "Style a single line of a caption. Captions keep the line breaks you type, and you could already restyle one word or the whole block. Now every line you type gets its own \"Line 1\", \"Line 2\" chip in the Captions tab: click one for the same card you use on words — colour, font, size, glow, shadow, with Reset. A word you styled yourself still wins over its line, line styles follow the text as you edit it, and the export matches what you see in the preview.",
      "Copy a layout from one section and paste it onto another, or onto another clip. Right-click a section on the timeline for \"Copy layout\" and \"Paste layout\", or use the two new buttons in the Layout panel — in \"This clip\" mode a paste sets the whole clip. Ctrl+Shift+C and Ctrl+Shift+V do the same for whatever is under the playhead. The copy survives switching clips, so you can carry a layout to another clip from the same recording; pasting onto a recording of a different size is refused with a message, and a paste can be undone.",
      "Drag the editor timeline taller. Its top edge is now a handle: pull it up for as much as half the editor and the preview shrinks to make room. It never gets smaller than the lanes need, double-click the handle snaps it back, and the height is remembered next time you open a clip.",
    ],
    changed: [
      "\"Apply to all clips\" no longer wipes the clips you already edited. In the Layout panel the button is now \"Apply to clips without their own layout\": clips that were following the project default pick up the new one, and clips you gave their own layout keep it. A line underneath says how many keep theirs, with a link for the old replace-everything behaviour. The Recording levels popover on the audio lane works the same way.",
      "Editing a game now uses the width of the window. Settings → Games → edit a game was a narrow single column that scrolled as a whole. It is now a wide two-column card with a pinned Cancel / Save row: tag, day, hashtag, colour, game art and linked program on the left, AI Context open on the right instead of hidden away, and Active / Inactive as a small toggle in the header.",
    ],
    fixed: [
      "Subtitles no longer show a lowercase \"i\", \"jesus\" or \"god\". Whisper writes them in lowercase; Corva now capitalises I, I'm, I'll, I've, I'd, God, Jesus and Christ the moment a recording is transcribed, and again when an older project is opened, previewed or rendered. Words you edited yourself are never rewritten, and \"goddamn\" is left alone.",
      "A word said two seconds later than the subtitle claimed now lands where you said it. Whisper sometimes parks a word inside a pause long before it was spoken, so nothing shows while you talk and the next words pop in late. Corva now spots a word sitting in silence with a long gap after it and moves it to where the speech actually starts.",
      "Phrases stay together in the 3-word subtitles. The grouper filled three words wherever there was no pause, splitting things like \"took out\", \"three of us\" and \"oh my word\" across two pills. Those now count as one unit.",
      "The playhead reaches every lane. It stopped short of the Music and SFX lanes because its height was fixed to an older, shorter set of lanes. It now runs from the ruler to the last lane however many there are, and it is a thin line in your theme's accent colour instead of a thick grey one.",
      "A rejection note now stays visible after you write it. In the Projects tab, typing a note on a rejected clip saved silently and collapsed into a pill that looked the same as an empty one. The box is now full-width and wraps as you type, a green \"Saved\" tick flashes when it lands, and the note shows in full on its own row underneath — click it to edit.",
    ],
  },
  {
    version: "0.4.0-alpha.27",
    date: "2026-09-05",
    added: [
      "Pick the days you post on. Edit slots on the Tracker now starts with seven day chips, Sunday included. Turn a day off and it shrinks to a slim strip so your posting days keep their room; turn Sunday on for a one-off weekend and the week, the pace line and the Queue's date list all follow. Days save with the week, the default and your presets, just like the times.",
      "A quiet \"+ Log a post\" row at the bottom of each day that has started, for posts you made by hand. It opens the usual log popup with a time you can edit.",
    ],
    changed: [
      "What's new and Release history got a proper screen. The release you're reading fills a wide card: version, date and a count of what changed up top, then one card per change with the headline in bold. Several releases show as a list on the left — click one, or use the up and down arrow keys.",
    ],
    fixed: [
      "Title cards and captions always make it into the export. A clip that opens with a title card and no words underneath could render with the card missing, or appearing only at the first spoken word. The render now takes each picture only after it has been drawn and double-checks it before using it.",
      "No more holes in the week log. A post a few minutes off a slot now fills that slot, and an empty slot whose time has passed simply isn't shown — the current week reads like a past week. Later today and future days keep their empty slots for scheduling.",
    ],
  },
  {
    version: "0.4.0-alpha.26",
    date: "2026-09-05",
    fixed: [
      "Pausing a clip in the editor stops the sound again. With recording levels in use, the pause button and Space froze the picture but the audio kept playing with no way to stop it.",
    ],
  },
  {
    version: "0.4.0-alpha.25",
    date: "2026-09-05",
    added: [
      "Recording levels: balance your mic, game and browser tracks without leaving Corva. In the editor, the small sliders icon on the Audio lane opens one slider per audio track of your recording (Mic, Game/Desktop, and any track you named in the audio setup). Turn the browser up or the mic down and you hear it live as you drag; the finished clip exports at the same levels. Levels save with the clip, and \"Apply to every clip\" makes them the default for every clip from that recording. Tracks with no sound in the clip say \"silent here\". Clips you never touch sound exactly as before.",
    ],
  },
  {
    version: "0.4.0-alpha.24",
    date: "2026-09-04",
    fixed: [
      "Dropping an .mkv recording on the Recordings tab now works. Corva converts it to a real MP4 as it imports (the video itself is untouched), then renames and clips it like any other recording. A file that isn't a video says so instead of the drop doing nothing.",
      "Changing a clip's game in Projects now moves what Corva learned from that clip (your keep or skip decision) to the new game, so a mis-tag you correct no longer keeps teaching the wrong game.",
      "Retry Failed in the Queue now also posts to a platform you switched on after the first attempt failed, so a clip can't end up posted everywhere except one platform with nothing left in the Queue to show for it.",
      "The timeline's right-click menu shows the real Split key (U, or whatever you rebound it to) instead of S.",
      "Every game in your library now has a YouTube description to start from. The Just Chatting entry Corva adds on first run never got one, so its clips went out with only the title as the description; that is filled in on the next start, and Captions & Descriptions now lists every game, with an Add chip on any that has no description yet so you can create one from the template. Deleting a description asks first.",
      "In the editor, Undo after switching subtitle mode (3 Words / 1 Word) now puts the dropdown back too, not just the subtitles.",
      "Renaming a recording that is still in use (OBS still writing, or open in a player) now tells you so in plain words instead of showing a raw file-system error.",
      "Publishing to Facebook after your login has expired now refreshes it first, the way TikTok, Instagram and YouTube already did, instead of failing with a Meta error.",
    ],
  },
  {
    version: "0.4.0-alpha.23",
    date: "2026-09-03",
    added: [
      "The subtitle timing engine now ships with Corva. After this update the app offers one more download (about 2 GB: three small speech models) under \"Update Corva's AI engine\". Click Finish Setup once and every new clip gets the improved word timing on any PC, with or without an NVIDIA card. Until that download finishes, subtitles keep the previous timing.",
    ],
    changed: [
      "Word timing now takes four independent opinions instead of three, and the fourth is a different kind of listener (a Kaldi speech recogniser pinned to your transcript). On the clips you have hand-timed, 86 in 100 word starts now land where you put them, up from 84.",
      "A clip you stretch on the timeline past its original range, or one whose own transcription failed, no longer falls back to rough word timing: the full-recording pass now runs a lighter timing step too.",
      "The full-recording transcription pass is a little faster. It used to spend about 100 seconds on word timing it never used; the lighter step above costs about 50 seconds on an NVIDIA card. On a PC without one it only runs for recordings under 10 minutes, so long sessions do not pay extra.",
    ],
  },
  {
    version: "0.4.0-alpha.22",
    date: "2026-09-02",
    changed: [
      "Subtitle words now fire when they are actually spoken. Every word's start time is decided by three independent aligners voting, so the first word of a pill no longer lights up during the pause before it, and middle and last words no longer jump late. Only new transcriptions get this; clips you already edited keep your timing.",
      "Reopening an edited clip keeps your word timing exactly as you saved it. Before, a cleanup pass could nudge a few hand-set words on every reopen.",
      "Grouping: \"man\", \"bro\", \"dude\" and \"guys\" get their own pill, and a short pause after a two-word pill now ends it, matching how you split pills by hand.",
    ],
  },
  {
    version: "0.4.0-alpha.21",
    date: "2026-09-02",
    added: [
      "Schedule a clip straight from the Queue. Every unscheduled clip now has a Schedule button next to Post; click it and the date and time picker opens right under that row, already set to your next free slot.",
      "Merge subtitles on the timeline. Click a subtitle block and two small green dots appear on its top corners: the right dot joins it with the next subtitle, the left dot joins it with the previous one. Ctrl+Z undoes it.",
    ],
    changed: [
      "Publish is now Post. The Queue's buttons and confirmation say Post, since that is what you do on social media.",
    ],
  },
  {
    version: "0.4.0-alpha.20",
    date: "2026-09-01",
    fixed: [
      "The mouse pointer no longer vanishes over a cut. The three cut icons (move the cut, trim the left section, trim the right section) now actually draw, so the pointer turns into the icon instead of disappearing.",
    ],
  },
  {
    version: "0.4.0-alpha.19",
    date: "2026-09-01",
    changed: [
      "The cut between two sections now works the way DaVinci Resolve's does, with no Ctrl key. Hover the middle of the cut and the pointer becomes the move-the-cut icon: drag to slide the cut with both sections following. Hover just left of the cut and it becomes the trim icon for the section before; just right of it, the trim icon for the section after. Each spot also shows its own little marker on the timeline so you can see which edit you're about to make.",
    ],
  },
  {
    version: "0.4.0-alpha.18",
    date: "2026-09-01",
    added: [
      "You can now move a cut. Hover the join between two sections on the Audio lane and drag the two-bar handle: the section before ends later or earlier and the section after starts later or earlier by the same amount, so the clip's total length never changes. Hold Ctrl while dragging to trim just one side of the cut, the way it used to work.",
    ],
    fixed: [
      "Playback no longer gets stuck at a cut when two sections share the same footage. It used to reach the end of the first section, jump back, replay its tail and never move on. Using the same moment twice in one clip is allowed on purpose, and it now plays straight through.",
      "One Ctrl+Z now undoes a whole drag on a section edge. A long trim used to take several presses to revert.",
    ],
  },
  {
    version: "0.4.0-alpha.17",
    date: "2026-09-01",
    added: [
      "A clip's layout can now change at a cut. Once a clip has a cut in it, the Layout panel offers \"This section / This clip\": pick \"This section\" and whatever you set up, apply from your saved layouts, or detect goes to just the part of the clip the playhead is in — so a clip can play wide before a cut and punched-in after it. The switch happens exactly at the cut, in the preview and in the rendered video, and a small badge on the timeline marks any section that has its own layout. You can also switch a single section's layout off (\"No layout for this section\"); it then shows the whole picture letterboxed so the video never changes size mid-clip. Splitting or trimming a section keeps its layout, and \"Apply to all clips in this project\" clears section layouts along with the rest.",
    ],
  },
  {
    version: "0.4.0-alpha.16",
    date: "2026-09-01",
    added: [
      "Layouts are now per clip. Applying a layout in the editor changes only the clip you're in — the rest of the project keeps its own look. The Layout panel shows whether the clip uses its own layout (\"This clip only\") or the project's (\"All clips\"), and a new \"Apply to all clips in this project\" button does what applying used to do. You can also switch a single clip's layout off entirely — handy when one clip needs a totally different framing, like a reaction to a vertical video.",
      "\"Detect layout\" now studies the clip you have open instead of sampling the whole recording, so the boxes it proposes come from that clip's actual footage.",
    ],
    fixed: [
      "A new clip that reuses a title you've already published no longer vanishes from the Queue and pretends it went out. It shows up and publishes like any other clip.",
      "Two clips in the same project with the same title no longer overwrite each other's Shorts thumbnail when you use the editor's screenshot button.",
    ],
  },
  {
    version: "0.4.0-alpha.15",
    date: "2026-08-31",
    added: [
      "Each game can now carry its own tag line for TikTok, Instagram and Facebook. Type it once on the new \"Game tags\" row in the Queue's captions panel — say #vct #100thieves #100T — and every clip of that game gets those tags added on all three platforms automatically. No more pasting the same hashtags into caption after caption.",
    ],
    changed: [
      "The Queue tab got a layout pass: the Captions & Descriptions panel is wider, the stat cards and clip rows are tighter, and the page scrolls a lot less. Scheduled clips also stopped showing their date twice — one column now shows the date, or a status pill when something is actually happening (publishing, failed, published, not rendered).",
      "Everything in the captions panel is click-to-edit now: click straight into the description, the tags, a platform template, or the game tag line, and clicking away saves it — a small \"Saved ✓\" confirms. Escape backs out without saving. The Edit buttons are gone, and the copy button sits next to the description where you'd look for it.",
      "The automatic game hashtag in TikTok, Instagram and Facebook captions is now the game's full hashtag (like #100thieves) instead of its short code (like #1oot). The per-game YouTube Title box is gone from the panel — it never did anything; clips always publish under their own titles.",
      "The render progress popup now just shows the percentage under the bar instead of technical play-by-play like \"Rendering subtitle frame 391/392\".",
    ],
    fixed: [
      "AI captions no longer come back with a stray \" / \" in them. The slash was never meant to be text — it was how the AI was shown where a caption's line break goes, and it started typing it out literally. Captions now arrive with real line breaks, and the suggestion card shows them stacked the way they'll appear on the video.",
      "The three captions are no longer just the three titles reworded. Only the first card is deliberately shared between a title and a caption — the strongest line shouldn't be wasted on one surface — but cards two and three are now their own ideas, so a generation gives you five distinct angles instead of three.",
    ],
  },
  {
    version: "0.4.0-alpha.14",
    date: "2026-08-30",
    added: [
      "Settings has a new About section. It shows the version you're on, a \"Check for updates\" button so you no longer have to restart Corva to find out if there's a new one, and a \"View release history\" button that re-opens everything past updates changed — including this screen's older entries — any time you want to look back.",
      "Four new themes join the picker: Graphite (neutral grey with steel-blue highlights), Forest (dark green with an emerald glow), Amethyst (dark purple through and through), and Paper (a soft warm light theme for anyone who found Daylight's white too bright).",
    ],
    fixed: [
      "Buttons across the editor have their rounded corners back. The theme update accidentally dropped the one setting that controlled corner roundness, which quietly squared off the save button, the queue button, play/pause and about eighty other spots.",
    ],
  },
  {
    version: "0.4.0-alpha.13",
    date: "2026-08-30",
    changed: [
      "The game dropdown in the editor's AI panel now only steers the titles it writes. Picking a different game there used to quietly re-file the clip under that game — it would change banners in the Queue and publish with that game's tags. Now it just tells the AI what to write about, and nothing else moves. To actually change what a clip is filed under, use the tag pill on the clip in the Projects tab, where you can see it happen.",
      "Clip detection now reads a content type's description. Content types (like Just Chatting or a watch-party show) have a field in Settings → Games → Edit → AI Context — now called \"About This Content\" — and what you write there reaches the AI that picks your clips, so it knows it's watching a Valorant match or GTA 6 footage instead of guessing from your voice alone. Games are unchanged; this was already how their researched knowledge worked.",
    ],
  },
  {
    version: "0.4.0-alpha.12",
    date: "2026-08-30",
    changed: [
      "YouTube tags are now edited as tags, not as one long line of text. Clicking the tag box used to flatten everything into \"tag one, tag two, tag three\", so getting rid of one meant hunting for it mid-sentence and holding backspace. Now each tag stays its own block with a small ✕ on it — one click removes it. Type a word and press comma or Enter to add one, paste a whole comma-separated list and it splits itself up, and backspace on an empty box takes the last one off. There is also a \"Clear all\" button for starting a set from scratch. If you change your mind, Escape (on a clip) or Cancel (in Captions & Descriptions) puts the list back exactly as it was. This applies both to a single clip’s tags on the Queue and to a game’s default list in Captions & Descriptions.",
    ],
  },
  {
    version: "0.4.0-alpha.11",
    date: "2026-08-29",
    fixed: [
      "A batch of colour touches that quietly went missing when themes arrived are back: the yellow and red warning banners have their tint again, the update banner has its purple wash, and the Tracker's auto-posted dots glow like they used to.",
    ],
  },
  {
    version: "0.4.0-alpha.10",
    date: "2026-08-28",
    added: [
      "Corva can now keep publishing while you stream. Turn on \"Keep publishing while I stream\" in Settings → Publishing, and closing Corva tucks it into the system tray instead of quitting — your scheduled clips still go out on time, on their own. The window closes for real, so Corva stops holding onto memory and your graphics card while you play. Right-click the tray icon to bring it back, or to quit properly. Leave the setting off and closing Corva quits it, exactly like before.",
      "Corva has themes. Settings has a new Appearance section with four of them: Midnight (the look you already had, still the default), Daylight for bright rooms, Neon Rose (dark, hot pink) and Blush (light pink). Pick one and the whole app repaints instantly — including the editor — and it stays that way next time you open Corva.",
    ],
    changed: [
      "Scheduled clips no longer need the Queue open to publish. The posting schedule used to run inside the app window, so a clip could only go out while Corva was open and on screen — and a minimised window risked being slowed down by Windows. It now runs in the background instead, which also means a clip whose time passed while Corva was closed goes out as soon as you next open it.",
      "A scheduled post that fails now reaches you no matter what. The Windows notification works even with the window closed, clicking it brings Corva back, and the red \"needs retry\" banner is waiting for you when it opens — including for failures that happened mid-stream.",
      "Settings is a real desktop page now, not a phone one. The six stacked dropdowns are gone — sections live in a list down the left side, one click each, and the section you're in stays on screen while you scroll. Nothing moved out of Settings; it's only laid out differently.",
      "Settings has a search box. Type \"youtube\" and you get both the account connection and the API keys, from two different sections, with a button that takes you straight to either one.",
      "The old \"Files & Folders\" group was carrying a third of Settings on its own, so the three processing settings inside it — Video Splitting, Pipeline Quality and Recording Layout — now have their own Pipeline section. \"Content Library\" is now \"Games\" and \"Tools & Credentials\" is now \"Tools & Keys\".",
    ],
  },
  {
    version: "0.4.0-alpha.9",
    date: "2026-08-28",
    added: [
      "What's New — after every update, Corva now opens with a quick summary of what changed, so you're never left guessing what an update did.",
    ],
    changed: [
      "Captions & Descriptions moved out of the bottom of the Queue and into a panel beside your clips. It follows whatever clip you've selected and shows only that game's set — pick a Rocket League clip and Rocket League's description is already there. Every other game sits behind one \"Other games\" button.",
      "The Queue reads properly now instead of as a wall of text. Each platform block wears its own colour — YouTube red, TikTok cyan, Instagram pink, Facebook blue — clip titles are bigger and bolder, and field labels are clearly labels instead of blending into their values.",
      "The startup splash now stays up for a couple of seconds and grows gently instead of pulsing, so fast launches don't flash it away.",
    ],
    fixed: [
      "The Tracker now records the exact time you posted a clip. It used to round your post to the nearest slot in your weekly schedule — a 2:45 PM post showed up as 2:30 PM.",
    ],
  },
];
