// Main leroy
var POST_URL = "DISCORD_WEBHOOK_URL_CHANGEME;
// Test leory
// var POST_URL = "DISCORD_WEBHOOK_URL_CHANGEME";

// Auction stuff
var AUCTION_END_TIME_HOURS = 21;
var DEFAULT_NOMINATOR_BID = 1;
var NOMINATOR_USER = "nominator";
var TIMEZONE = "GMT+1"

// Sheet stuff
var DRAFT_SUMMARY_SHEET_ID = 'GSHEET_ID_CHANGEME';
var AUCTIONS_SHEET = "auctions"
var RAW_BIDS_SHEET = "raw-bids"
var SUMMARY_SHEET = "summary"
var ROSTERS_SHEET_ID = "rosters"
var NUMBER_OF_TEAMS = "14"
var SUMMARY_SHEET_USERS_ROW_NUM = "2"
var SUMMARY_SHEET_EMAIL_COLUMN_NUM = "2"
var SUMMARY_SHEET_MAX_BID_COLUMN_NUM = "10"
var AUCTIONS_SHEET_PLAYERA_COLUMN_NUM = "0"
var AUCTIONS_SHEET_PLAYERB_COLUMN_NUM = "1"
var AUCTIONS_SHEET_DATE_COLUMN_NUM = "2"
var AUCTIONS_SHEET_URL_COLUMN_NUM = "3"
var AUCTIONS_SHEET_URL_COLUMN_LETTER = "D"

// Form stuff
var BIDDING_CONFIRMATION_MESSAGE = "You can come back and edit you bid right up until the auction closes.\nMay the odds be ever in your favour."
var FORM_DESCRIPTION = `A receipt of your form submission will be sent to the specified email address.
You will need a valid email to bid - please use the same email for every auction - this will allow us to track budgets.

Live budgets can be found here: CHANGEME

Auction Format:
- Auctions are conducted using the Vickery Method.
- Bids are blind & sealed.
- The highest bidder wins but the price paid is the second-highest bid.
- Nominations are effectively a $1 bid from the nominating-team.
- Any managers who do not nominate a player will have one chosen for them from the highest-available ADP

Auction Rules:
- The auctions will close daily at 9pm GMT, at which point the form will lock.
- You have to check the 'Record Email' box otherwise you bid will not be counted
- You can edit your bids as many times as you want.                                 

Auction Technical Details:
- If you don't want to bid on a player, leave the player's box empty.
- If you don't want to bid on any players, you don't even need to submit the form.  
- Bids should be whole numbers - decimals will be rounded down.
- If you bid more than your 'max bid' then your bid will be struck off. 
- If you win both auctions but cannot afford both players then the highest bid will take priority and your bids from the other player auction(s) will be stuck off.
- If you win both auctions with equal bids, the first listed auction will be resolved completely before the second.
- In the event of equal bids, check with the commissioners for tie breakers or a ruling.`

// Run this manually each week
function createWeeklyAuctionForms() {
  var auctions = loadAuctionsFromSheet();
  var auctionLinks = "This week's auctions are now live for early bidding:\n";
  
  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (doesAuctionAlreadyExists(a)) {
      var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
      auctionLinks += buildPrettyAuctionLink(f, a);
      continue;
    }
    var f = createFormForAuction(a);
    // update auction sheet with form ID. NOTE: google's API/permissions are weird. We need to do lookups on the URL not ID, so that's why we save the URL for use later
    var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(AUCTIONS_SHEET);
    sheet.getRange(AUCTIONS_SHEET_URL_COLUMN_LETTER + (i+2)).setValue(f.getEditUrl()); // sheet rows/columns are indexed from 1, not 0 :(
    submitNominatorBidsForAuction(f);
    addTriggers(f, a)
    auctionLinks += buildPrettyAuctionLink(f, a);
  };
 
  postToDiscord([], auctionLinks, randomAuctionWeeklyAnnoucement(), randomFooterQuote());
};

function createFormForAuction(a) {
  playerA = a[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM]
  playerB = a[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM]
  var players = (playerB === "" ) ? [playerA] : [playerA, playerB]; // if second player is blank then this is a single player auction

  console.log("Creating new auction/form for: " + players)
  var form = FormApp.create('Auction - ' + players);  
  form.setDescription(FORM_DESCRIPTION);
  form.setCollectEmail(true);
  form.setAllowResponseEdits(true);
  form.setLimitOneResponsePerUser(true);
  form.setConfirmationMessage(BIDDING_CONFIRMATION_MESSAGE);
  form.setCustomClosedFormMessage("Auction & bid submissions are now closed.")

  for (i = 0; i < players.length; i++) {
    var item = form.addTextItem().setTitle(players[i]);
    var validBid = FormApp.createTextValidation().setHelpText("Minimum bid is 2. Check the Spreadsheet to see what your max is.").requireNumberBetween(2, 10000).build();
    item.setValidation(validBid);
  };
  
  console.log("ID=" + form.getEditUrl() + " publishURL=" + form.getPublishedUrl());
  return form;
};

function validateAuction(a) {
  console.log("Validating auction: " + a);
  if (a[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM] === "" || a[AUCTIONS_SHEET_DATE_COLUMN_NUM] === "") {
    throw new Error("Atleast PlayerA and an auction date must be supplied for a auction.");
  }
}

function doesAuctionAlreadyExists(auction) {
  console.log("Checking to see if auction/form already exists for players: " + auction[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM] + " & " + auction[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM])
  if (auction[AUCTIONS_SHEET_URL_COLUMN_NUM] !== "" ) {
    console.log("...Auction/form already exists.")
    return true;
  }
  console.log("...No auction/form exists.")
  return false;
};

function isAuctionToday(auction) {
  console.log("Checking to see if auction is today: " + auction)
  auctionDate = new Date(auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]);
  today = new Date();
  return (today.getDate() == auctionDate.getDate() && today.getMonth() == auctionDate.getMonth() && today.getYear() == auctionDate.getYear());
};

function addTriggers(form, auction) { 
  console.log("Adding trigger to log bids on submissions");
  var endDate = new Date(auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]); // Date is 3rd column in auction row
  endDate.setHours(AUCTION_END_TIME_HOURS);
  endDate.setMinutes(0);
  endDate.setSeconds(0);
  ScriptApp.newTrigger("endDailyAuctions").timeBased().at(endDate).create();
  ScriptApp.newTrigger("validateAndLogBid").forForm(form).onFormSubmit().create();
};

//Add starting bid to player auctions: a $1 bid for each player
function submitNominatorBidsForAuction(form) {
  var nominatorResponse = form.createResponse();
  var items = form.getItems();
  for (i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.getType() == 'TEXT') {
      var textItem = item.asTextItem();
      console.log("Creating default nominator response ($1 bid) for " + textItem.getTitle())
      var itemresponse = textItem.createResponse(DEFAULT_NOMINATOR_BID);
      nominatorResponse.withItemResponse(itemresponse);  
    }
  }
  // Google's docs are shit. Submission of nominator bids doesn't work if you need emails or require sign in, and I can't supply them to the fake form response here.
  // So as a hack, i choose to disable them, submit and then reenable.
  form.setLimitOneResponsePerUser(false);
  form.setCollectEmail(false);
  nominatorResponse.submit();
  // Force the form to require a Google Login and grab their real email
  // Undocumented enum method to bypass Google's API limitations
  form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  form.setLimitOneResponsePerUser(true);
};

// Set this up with a onSubmit trigger for each form
function validateAndLogBid(e) {
  var user = e.response.getRespondentEmail().toLowerCase();
  var maxBidForUser = retrieveMaxBidFromSheet(user)
  if (maxBidForUser == null) {
    var validationErrorMsg = "Hey " + user + ", your email hasn't been recognised. Check you're signed in to the right account or ping Ioan.";
    postToDiscord([], validationErrorMsg, "Computer says no.", "I've got a spreadsheet here... and it says you're an idiot.")
    return
  }
  var bids = e.response.getItemResponses();
  var isABidOverMax = false;
  var bidValues = "";
  for (var i = 0; i < bids.length; i++) {
    bidValues += bids[i].getResponse() + " ";
    if (parseInt(bids[i].getResponse()) > maxBidForUser) {
      isABidOverMax = true;
    }
  }
  var firstPlayer = e.response.getItemResponses()[0].getItem().getTitle();
  console.log("User='" + user + "' max_bid='" + maxBidForUser + "' bids=[" + bidValues + "]" + " auctionIncludes='" + firstPlayer + "'");
  if (isABidOverMax) {
    var validationErrorMsg = "Hey " + user + ", you sure 'bout that bid? Wallet's looking a little light fella.";
    postToDiscord([], validationErrorMsg, "Computer says no.", "I've got a spreadsheet here... and it says you're an idiot.")
  }
};

// Set this up with a daily timer trigger
function dailyAuctionsReminder() {
  var auctions = loadAuctionsFromSheet();
  var auctionLinks = ""
  auctionLinks += "Today's auction(s) can be found here:\n";
  console.log("Checking to see which auctions are ending today...")
  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (!isAuctionToday(a)) {
      console.log("Auction is not today, so skipping.")
      continue;
    }
    var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
    auctionLinks += buildPrettyAuctionLink(f, a);
  };
  auctionLinks += "\n" + buildPrettyDraftLinks();
  postToDiscord([], auctionLinks, randomDailyReminder(), randomFooterQuote())
};

function endDailyAuctions() {
  var auctions = loadAuctionsFromSheet();
  console.log("Checking to see which auctions need to be closed...")  

  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (!isAuctionToday(a)) {
      console.log("Auction is not today, so skipping.")
      continue;
    }
    var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
    closeAuction(f);
    var bids = parseBidsFromResponses(f);
    writeToSheets(bids);
    
    var auctionSummaries = [];
    var uniquePlayers = getUniquePlayers(bids);
    var summaryMsg = "";
    for (k = 0; k < uniquePlayers.length; k++) {
      var player = uniquePlayers[k];
      var auctionBids = filterAndSortBids(bids, player)
//      sortedBids = checkForWinnerTie(sortedBids);
      auctionSummaries.push(formatBidsForDiscord(auctionBids, player));
      summaryMsg += buildCongratsMsg(auctionBids, player) + "\n"
    };
  
    auctionSummaries.push({
      "name": "Congratulations",
      "value": summaryMsg
    });
  
    postToDiscord(auctionSummaries, buildPrettyDraftLinks(), randomAuctionClosedQuote(), randomFooterQuote());

  };
};

function parseBidsFromResponses(form) {
  var allResponses = form.getResponses();
  var allBids = [];
  for (var i = 0; i < allResponses.length; i++) {
    var user = allResponses[i].getRespondentEmail().toLowerCase();
    var bids = allResponses[i].getItemResponses(); 
    var responseTime =  allResponses[i].getTimestamp();
    for (var j = 0; j < bids.length; j++) {
      var bid = parseInt(bids[j].getResponse());
      if (isNaN(bid)) {
        // The form sets 2 as min bid, but if a user bids and then removes their bid, their reponse will stay registered with a null/nan value. So if we can't parse it, then ignore the bid
        continue;
      } else if (bid == DEFAULT_NOMINATOR_BID || user == null) {
        user = NOMINATOR_USER;
      };
      allBids.push({
        "user": user,
        "player": ltrim(bids[j].getItem().getTitle()),
        "bid": bid,
        "time": responseTime
      })
    };
  };    
  console.log("Bids received & parsed for auction " + form.getTitle() + " : " + JSON.stringify(allBids));
  return allBids;
};

function retrieveMaxBidFromSheet(user) {
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(SUMMARY_SHEET);
  var searchRange = sheet.getRange(SUMMARY_SHEET_USERS_ROW_NUM, SUMMARY_SHEET_EMAIL_COLUMN_NUM, NUMBER_OF_TEAMS, SUMMARY_SHEET_MAX_BID_COLUMN_NUM).getValues();
  var maxBid = null;
  for(i = 0; i < searchRange.length; i++) {
    if(searchRange[i][0] == user) {
        maxBid = searchRange[i][(SUMMARY_SHEET_MAX_BID_COLUMN_NUM - SUMMARY_SHEET_EMAIL_COLUMN_NUM)];
        break;
    }
  }
  return maxBid;
}

function writeToSheets(bids) {
  var data = []
  // convert bids to sheet data format
  for (i = 0; i < bids.length; i++) {
    bid = bids[i]
    data.push([bid.user, bid.player, bid.bid, bid.time])
  }
  console.log("Writing raw bid data to sheet: "+ data)
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(RAW_BIDS_SHEET)
  sheet.getRange(sheet.getLastRow()+1, 1, data.length, data[0].length).setValues(data);
  
  var uniquePlayers = getUniquePlayers(bids);
  for (k = 0; k < uniquePlayers.length; k++) {
    data = [];
    var player = uniquePlayers[k];
    var sortedBids = filterAndSortBids(bids, player);
//    sortedBids = checkForWinnerTie(sortedBids);
    var paidPrice = ((sortedBids.length > 1) ? sortedBids[1].bid : DEFAULT_NOMINATOR_BID);
    var user = sortedBids[0].user;
    userSheet = getOrCreateSheet(user);
    var rowToWriteTo = userSheet.getLastRow() + 1;
    var positionFormula = "=REGEXREPLACE(A" + rowToWriteTo + ',".* - ", "")';
    data.push([player, sortedBids[0].bid, paidPrice, positionFormula]);
    console.log("Writing winner bid data " + data + " to sheet " + user)
    userSheet.getRange(rowToWriteTo, 1, data.length, data[0].length).setValues(data);
  };
};

// I accept the description seperate since discord allow you to enrich this field with markdown
function postToDiscord(message, description, title, footer) {
  var options = {
    "muteHttpExceptions": false,
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
    },
    "payload": JSON.stringify({
      "username": "Roybot",
      "content": "", /// Not an empty string
      "embeds": [{
        "title": title,
        "description": description,
        "fields": message,
        "thumbnail": {
          "url": "https://image.lexica.art/full_jpg/a464094a-b537-480e-b66e-cd52a2a329e5",
        },
        "footer": {
          "text": '"' + footer + '"'
        }
      }],
    })
  };
  console.log("POST to discord webhook with config: " + options)
  console.log("POST to discord webhook with config: " + JSON.stringify(options))
  UrlFetchApp.fetch(POST_URL, options);
};

function deleteFormSubmissionAndAuctionEndTriggers() {
  const targetFunctions = ["validateAndLogBid", "endDailyAuctions"];
  const triggers = ScriptApp.getProjectTriggers();
  let deleteCount = 0;
  
  for (let i = 0; i < triggers.length; i++) {
    const handlerFunction = triggers[i].getHandlerFunction();
    
    if (targetFunctions.includes(handlerFunction)) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleteCount++;
      console.log("Deleted trigger for function: " + handlerFunction);
    }
  }
  
  console.log("Cleanup complete. Total triggers removed: " + deleteCount);
}

// +++++++++++++++++++++++++++++++++++++ Sheets & forms +++++++++++++++++++++++++++++++++++++++++++

function loadAuctionsFromSheet() {
  console.log("Loading auctions from sheet")
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(AUCTIONS_SHEET);
  var auctions = sheet.getDataRange().getValues();
  return auctions.slice(1); // Remove row containing headings
};

function getOrCreateSheet(user) {
  var spreadsheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID);
  console.log("Looking for team sheet for user: " + user)
  var sheet = spreadsheet.getSheetByName(user);
  if (sheet == null) {
    console.log("Sheet doesn't exist for user '" + user + "' so creating one.")
    sheet = spreadsheet.insertSheet(user, spreadsheet.getNumSheets());
    sheet.appendRow(["player", "bid", "paid"]);
  }
  return sheet;
}
  
function closeAuction(form) {
  console.log("Closing form for responses.");
  form.setAcceptingResponses(false);
};

// --------------------------------------- Formatting ---------------------------------------------

function formatBidsForDiscord(bids, player) {  
  var detailedBids = ""
  // There will always be atleast 1 bid since the opening bid is value=1 from the nominator and created when the form opens.
  for (var i = 0; i < bids.length; i++) {
    detailedBids += "$" + bids[i].bid + " - " + bids[i].user + " at " + Utilities.formatDate(bids[i].time, TIMEZONE, "MM/dd HH:mm") + "\n"
  };
  return {
    "name": player,
    "value": detailedBids,
    "inline": false
  };
};

function buildCongratsMsg(sortedBids, player) {
  // minimum winning bid is the entry bid from the nominator
  var winningBid = DEFAULT_NOMINATOR_BID;
  // There will always be atleast 1 bid since the opening bid is value=1 from the nominator
  var winner = sortedBids[0].user;
  if (sortedBids.length > 1) {
    winningBid = sortedBids[1].bid;
  }
  return player + " sold to " + winner + " for $" + winningBid
};

function buildPrettyDraftLinks() {
  var ssURL = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getUrl();
  return "Updated rosters and budgets can be found [here](" + ssURL + ").";
};

function buildPrettyAuctionLink(form, auction) {
  var playerA = auction[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM];
  var playerB = auction[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM];
  var endDate = new Date (auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]);
  endDate.setHours(AUCTION_END_TIME_HOURS);
  var prettyEndDate = Utilities.formatDate(endDate, TIMEZONE, "MMMM dd HH:mm");
  return "[" + playerA + " & " + playerB + "](" + form.getPublishedUrl() + ") - ends " + prettyEndDate + "\n"
};

// ========================================= Utility ======================================================

function getUniquePlayers(allBids) {
  return [... new Set(allBids.map(data => data.player))]
};

function filterAndSortBids(allBids, player) {
  var filteredByPlayer = allBids.filter(function (f) {
    return f.player == player
  });
  return filteredByPlayer.sort(function descendingBids( a, b ) {
    if (a.bid > b.bid) {
      return -1;
    } else if (a.bid < b.bid) {
      return 1;
    } else if (a.bid == b.bid) {
      var timeA = new Date(a.time);
      var timeB = new Date(b.time);
      if (timeA < timeB) {
        return -1;
      } else if (timeA > timeB) {
        return 1;
      }     
    }
    return 0;
  });
};

function ltrim(str) {
  if(!str) return str;
  return str.replace(/^\s+/g, '');
};

// ========================================= Nonsense =====================================================
function randomDailyReminder() {
  const quotes = [
    "May the odds be ever in your favor.",
    "Clear eyes, full hearts, can't lose.",
    "No half measures.",
    "Fear is the mind-killer",
    "We will toss the dice however they fall.",
  ]
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

function randomAuctionWeeklyAnnoucement() {
  const quotes = [
    "He who controls the spice controls the universe.",
    "Welcome to another week of psychological warfare masquerading as a hobby.",
    "We have to find value where no one else sees it.",
  ];
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

function randomAuctionClosedQuote() {
  const quotes = [
    "It's all computer.",
    "The desert takes the weak.",
    "You underestimate the power of faith.",
    "A Lannister always pays his debts.",
    "The Wheel weaves as the Wheel wills.",
    "Life before death, strength before weakness, journey before destination",
  ];
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

function randomFooterQuote(winner, winningBid) {
  const quotes = [
    "When I look at a wall, I look at it as a door.",
    "When the seagulls follow the trawler, it's because they think sardines will be thrown into the sea.",
    "The spice must flow.",
    "Let's go get a goddamn snack!",
    "I have a system. It's a highly sophisticated, multi-tiered system.",
    "It's a law, like water or dinosaurs.",
    "Frosties are just Cornflakes for people who can't face reality.",
    "This is a disaster. A total catastrophe. I'm going to have to eat my own shoes.",
    "Is this a good idea? It feels like the sort of thing people who don't know what they're doing think is a good idea.",
    "This is like watching a porno, except I can't see anything, I haven't got a hard-on, and I want to cry.",
    "That is a car crash of a shopping basket.",
    "He is beginning to believe.",
    "Not like this. Not like this.",
    "You have to let it all go, Neo. Fear, doubt, and disbelief. Free your mind.",
    "This is a long-term economic strategy. It’s not 'madness', it’s just very advanced accounting.",
    "It is remarkable how similar the pattern of love is to the pattern of insanity.",
    "People like Coldplay and voted for the Nazis. You can't trust people, Jeremy.",
    "Expectations are like fine pottery. The harder you hold them, the more likely they are to break.",
    "I don't want to tempt fate, but I think everything is going to be totally great forever.",
    "Your scientists were so preoccupied with whether or not they could, they didn't stop to think if they should.",
    "You ate your nest egg? You're meant to sit on your nest egg til it hatches, not eat it like some greedy, mad chicken.",
    "The framework is there, the spreadsheet is up and running... Now we just need to fill it with lies and panic.",
    "I don't care about the rules! The rules are just a suggestion made by people who are afraid of the dark!",
    "I don't believe in luck. I believe in preparation meeting opportunity, wrapped in a highly sophisticated spreadsheet.",
  ];
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

// Run this manually each week
function createWeeklyAuctionForms() {
  var auctions = loadAuctionsFromSheet();
  var auctionLinks = "This week's auctions are now live for early bidding:\n";
  
  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (doesAuctionAlreadyExists(a)) {
      var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
      auctionLinks += buildPrettyAuctionLink(f, a);
      continue;
    }
    var f = createFormForAuction(a);
    // update auction sheet with form ID. NOTE: google's API/permissions are weird. We need to do lookups on the URL not ID, so that's why we save the URL for use later
    var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(AUCTIONS_SHEET);
    sheet.getRange(AUCTIONS_SHEET_URL_COLUMN_LETTER + (i+2)).setValue(f.getEditUrl()); // sheet rows/columns are indexed from 1, not 0 :(
    submitNominatorBidsForAuction(f);
    addTriggers(f, a)
    auctionLinks += buildPrettyAuctionLink(f, a);
  };
 
  postToDiscord([], auctionLinks, GET_READY_MSG);
};

function createFormForAuction(a) {
  playerA = a[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM]
  playerB = a[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM]
  var players = (playerB === "" ) ? [playerA] : [playerA, playerB]; // if second player is blank then this is a single player auction

  console.log("Creating new auction/form for: " + players)
  var form = FormApp.create('Auction - ' + players);  
  form.setDescription(FORM_DESCRIPTION);
  form.setCollectEmail(true);
  form.setAllowResponseEdits(true);
  form.setLimitOneResponsePerUser(true);
  form.setConfirmationMessage(BIDDING_CONFIRMATION_MESSAGE);
  form.setCustomClosedFormMessage("Auction & bid submissions are now closed.")

  for (i = 0; i < players.length; i++) {
    var item = form.addTextItem().setTitle(players[i]);
    var validBid = FormApp.createTextValidation().setHelpText("Minimum bid is 2. Check the Spreadsheet to see what your max is.").requireNumberBetween(2, 10000).build();
    item.setValidation(validBid);
  };
  
  console.log("ID=" + form.getEditUrl() + " publishURL=" + form.getPublishedUrl());
  return form;
};

function validateAuction(a) {
  console.log("Validating auction: " + a);
  if (a[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM] === "" || a[AUCTIONS_SHEET_DATE_COLUMN_NUM] === "") {
    throw new Error("Atleast PlayerA and an auction date must be supplied for a auction.");
  }
}

function doesAuctionAlreadyExists(auction) {
  console.log("Checking to see if auction/form already exists for players: " + auction[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM] + " & " + auction[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM])
  if (auction[AUCTIONS_SHEET_URL_COLUMN_NUM] !== "" ) {
    console.log("...Auction/form already exists.")
    return true;
  }
  console.log("...No auction/form exists.")
  return false;
};

function isAuctionToday(auction) {
  console.log("Checking to see if auction is today: " + auction)
  auctionDate = new Date(auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]);
  today = new Date();
  return (today.getDate() == auctionDate.getDate() && today.getMonth() == auctionDate.getMonth() && today.getYear() == auctionDate.getYear());
};

function addTriggers(form, auction) { 
  console.log("Adding trigger to log bids on submissions");
  var endDate = new Date(auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]); // Date is 3rd column in auction row
  endDate.setHours(AUCTION_END_TIME_HOURS);
  endDate.setMinutes(0);
  endDate.setSeconds(0);
  ScriptApp.newTrigger("endDailyAuctions").timeBased().at(endDate).create();
  ScriptApp.newTrigger("validateAndLogBid").forForm(form).onFormSubmit().create();
};

//Add starting bid to player auctions: a $1 bid for each player
function submitNominatorBidsForAuction(form) {
  var nominatorResponse = form.createResponse();
  var items = form.getItems();
  for (i = 0; i < items.length; i++) {
    var item = items[i]
    if (item.getType() == 'TEXT') {
      var textItem = item.asTextItem();
      console.log("Creating default nominator response ($1 bid) for " + textItem.getTitle())
      var itemresponse = textItem.createResponse(DEFAULT_NOMINATOR_BID);
      nominatorResponse.withItemResponse(itemresponse);  
    }
  }
  // Google's docs are shit. Submit doesn't work if you need emails or require sign in, and I can't supply them to the fake form response here.
  // So as a hack, i choose to disable them, submit and then reenable.
  form.setLimitOneResponsePerUser(false);
  form.setCollectEmail(false);
  nominatorResponse.submit();
  form.setCollectEmail(true);
  form.setLimitOneResponsePerUser(true);
};

// Set this up with a onSubmit trigger for each form
function validateAndLogBid(e) {
  var user = e.response.getRespondentEmail().toLowerCase();
  var maxBidForUser = retrieveMaxBidFromSheet(user)
  var bids = e.response.getItemResponses();
  var isABidOverMax = false;
  var bidValues = "";
  for (var i = 0; i < bids.length; i++) {
    bidValues += bids[i].getResponse() + " ";
    if (parseInt(bids[i].getResponse()) > maxBidForUser) {
      isABidOverMax = true;
    }
  }
  console.log("User='" + user + "' max_bid='" + maxBidForUser + "' bids=[" + bidValues + "]");
  if (isABidOverMax) {
    var validationErrorMsg = "Hey " + user + ", you sure 'bout that bid? Wallet's looking a little light fella.";
    postToDiscord([], validationErrorMsg, INVALID_BID_MSG)
  }
};

// Set this up with a daily timer trigger
function dailyAuctionsReminder() {
  var auctions = loadAuctionsFromSheet();
  var auctionLinks = ""
  auctionLinks += "Today's auction(s) can be found here:\n";
  console.log("Checking to see which auctions are ending today...")
  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (!isAuctionToday(a)) {
      console.log("Auction is not today, so skipping.")
      continue;
    }
    var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
    auctionLinks += buildPrettyAuctionLink(f, a);
  };
  auctionLinks += "\n" + buildPrettyDraftLinks();
  postToDiscord([], auctionLinks, GOOD_LUCK_MSG)
};

function endDailyAuctions() {
  var auctions = loadAuctionsFromSheet();
  console.log("Checking to see which auctions need to be closed...")  

  for (var i = 0; i < auctions.length; i++) {
    var a = auctions[i];
    validateAuction(a)
    if (!isAuctionToday(a)) {
      console.log("Auction is not today, so skipping.")
      continue;
    }
    var f = FormApp.openByUrl(a[AUCTIONS_SHEET_URL_COLUMN_NUM]);
    closeAuction(f);
    var bids = parseBidsFromResponses(f);
    writeToSheets(bids);
    
    var auctionSummaries = [];
    var uniquePlayers = getUniquePlayers(bids);
    var summaryMsg = "";
    for (k = 0; k < uniquePlayers.length; k++) {
      var player = uniquePlayers[k];
      var auctionBids = filterAndSortBids(bids, player)
//      sortedBids = checkForWinnerTie(sortedBids);
      auctionSummaries.push(formatBidsForDiscord(auctionBids, player));
      summaryMsg += buildCongratsMsg(auctionBids, player) + "\n"
    };
  
    auctionSummaries.push({
      "name": "Congratulations",
      "value": summaryMsg
    });
  
    postToDiscord(auctionSummaries, buildPrettyDraftLinks(), END_OF_AUCTION_MSG);

  };
};

function parseBidsFromResponses(form) {
  var allResponses = form.getResponses();
  var allBids = [];
  for (var i = 0; i < allResponses.length; i++) {
    var user = allResponses[i].getRespondentEmail().toLowerCase();
    var bids = allResponses[i].getItemResponses(); 
    var responseTime =  allResponses[i].getTimestamp();
    for (var j = 0; j < bids.length; j++) {
      var bid = parseInt(bids[j].getResponse());
      if (isNaN(bid)) {
        // The form sets 2 as min bid, but if a user bids and then removes their bid, their reponse will stay registered with a null/nan value. So if we can't parse it, then ignore the bid
        continue;
      } else if (bid == DEFAULT_NOMINATOR_BID || user == null) {
        user = NOMINATOR_USER;
      };
      allBids.push({
        "user": user,
        "player": ltrim(bids[j].getItem().getTitle()),
        "bid": bid,
        "time": responseTime
      })
    };
  };    
  console.log("Bids received & parsed for auction " + form.getTitle() + " : " + JSON.stringify(allBids));
  return allBids;
};

function retrieveMaxBidFromSheet(user) {
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(SUMMARY_SHEET);
  var searchRange = sheet.getRange(SUMMARY_SHEET_USERS_ROW_NUM, SUMMARY_SHEET_EMAIL_COLUMN_NUM, NUMBER_OF_TEAMS, SUMMARY_SHEET_MAX_BID_COLUMN_NUM).getValues();
  var maxBid = null;
  for(i = 0; i < searchRange.length; i++) {
    if(searchRange[i][0] == user) {
        maxBid = searchRange[i][(SUMMARY_SHEET_MAX_BID_COLUMN_NUM - SUMMARY_SHEET_EMAIL_COLUMN_NUM)];
        break;
    }
  } 
  return maxBid;
}

function writeToSheets(bids) {
  var data = []
  // convert bids to sheet data format
  for (i = 0; i < bids.length; i++) {
    bid = bids[i]
    data.push([bid.user, bid.player, bid.bid, bid.time])
  }
  console.log("Writing raw bid data to sheet: "+ data)
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(RAW_BIDS_SHEET)
  sheet.getRange(sheet.getLastRow()+1, 1, data.length, data[0].length).setValues(data);
  
  var uniquePlayers = getUniquePlayers(bids);
  for (k = 0; k < uniquePlayers.length; k++) {
    data = [];
    var player = uniquePlayers[k];
    var sortedBids = filterAndSortBids(bids, player);
//    sortedBids = checkForWinnerTie(sortedBids);
    var paidPrice = ((sortedBids.length > 1) ? sortedBids[1].bid : DEFAULT_NOMINATOR_BID);
    var user = sortedBids[0].user;
    userSheet = getOrCreateSheet(user);
    var rowToWriteTo = userSheet.getLastRow() + 1;
    var positionFormula = "=REGEXREPLACE(A" + rowToWriteTo + ',".* - ", "")';
    data.push([player, sortedBids[0].bid, paidPrice, positionFormula]);
    console.log("Writing winner bid data " + data + " to sheet " + user)
    userSheet.getRange(rowToWriteTo, 1, data.length, data[0].length).setValues(data);
  };
};

// I accept the description seperate since discord allow you to enrich this field with markdown
function postToDiscord(message, description, title) {
  var options = {
    "muteHttpExceptions": false,
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
    },
    "payload": JSON.stringify({
      "username": "Roybot",
      "content": "", /// Not an empty string
      "embeds": [{
        "title": title,
        "description": description,
        "fields": message,
        "footer": {
          "text": randomQuote()
        }
      }],
    })
  };
  console.log("POST to discord webhook with config: " + options)
  console.log("POST to discord webhook with config: " + JSON.stringify(options))
  UrlFetchApp.fetch(POST_URL, options);
};

// +++++++++++++++++++++++++++++++++++++ Sheets & forms +++++++++++++++++++++++++++++++++++++++++++

function loadAuctionsFromSheet() {
  console.log("Loading auctions from sheet")
  var sheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getSheetByName(AUCTIONS_SHEET);
  var auctions = sheet.getDataRange().getValues();
  return auctions.slice(1); // Remove row containing headings
};

function getOrCreateSheet(user) {
  var spreadsheet = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID);
  console.log("Looking for team sheet for user: " + user)
  var sheet = spreadsheet.getSheetByName(user);
  if (sheet == null) {
    console.log("Sheet doesn't exist for user '" + user + "' so creating one.")
    sheet = spreadsheet.insertSheet(user, spreadsheet.getNumSheets());
    sheet.appendRow(["player", "bid", "paid"]);
  }
  return sheet;
}
  
function closeAuction(form) {
  console.log("Closing form for responses.");
  form.setAcceptingResponses(false);
};

// --------------------------------------- Formatting ---------------------------------------------

function formatBidsForDiscord(bids, player) {  
  var detailedBids = ""
  // There will always be atleast 1 bid since the opening bid is value=1 from the nominator and created when the form opens.
  for (var i = 0; i < bids.length; i++) {
    detailedBids += "$" + bids[i].bid + " - " + bids[i].user + " at " + Utilities.formatDate(bids[i].time, TIMEZONE, "MM/dd HH:mm") + "\n"
  };
  return {
    "name": player,
    "value": detailedBids,
    "inline": false
  };
};

function buildCongratsMsg(sortedBids, player) {
  // minimum winning bid is the entry bid from the nominator
  var winningBid = DEFAULT_NOMINATOR_BID;
  // There will always be atleast 1 bid since the opening bid is value=1 from the nominator
  var winner = sortedBids[0].user;
  if (sortedBids.length > 1) {
    winningBid = sortedBids[1].bid;
  }
  return player + " sold to " + winner + " for $" + winningBid
};

function buildPrettyDraftLinks() {
  var ssURL = SpreadsheetApp.openById(DRAFT_SUMMARY_SHEET_ID).getUrl();
  return "Updated rosters and budgets can be found [here](" + ssURL + ").";
};

function buildPrettyAuctionLink(form, auction) {
  var playerA = auction[AUCTIONS_SHEET_PLAYERA_COLUMN_NUM];
  var playerB = auction[AUCTIONS_SHEET_PLAYERB_COLUMN_NUM];
  var endDate = new Date (auction[AUCTIONS_SHEET_DATE_COLUMN_NUM]);
  endDate.setHours(AUCTION_END_TIME_HOURS);
  var prettyEndDate = Utilities.formatDate(endDate, TIMEZONE, "MMMM dd HH:mm");
  return "[" + playerA + " & " + playerB + "](" + form.getPublishedUrl() + ") - ends " + prettyEndDate + "\n"
};

// ========================================= Utility ======================================================

function randomQuote(winner, winningBid) {
  // "No half measures"
  return "Clear eyes, full hearts, can't lose." // Could add a note here to the updated spreadsheet with new budgets?
};

function getUniquePlayers(allBids) {
  return [... new Set(allBids.map(data => data.player))]
};

function filterAndSortBids(allBids, player) {
  var filteredByPlayer = allBids.filter(function (f) {
    return f.player == player
  });
  return filteredByPlayer.sort(function descendingBids( a, b ) {
    if (a.bid > b.bid) {
      return -1;
    } else if (a.bid < b.bid) {
      return 1;
    } else if (a.bid == b.bid) {
      var timeA = new Date(a.time);
      var timeB = new Date(b.time);
      if (timeA < timeB) {
        return -1;
      } else if (timeA > timeB) {
        return 1;
      }     
    }
    return 0;
  });
};

function ltrim(str) {
  if(!str) return str;
  return str.replace(/^\s+/g, '');
};
