// Main leroy
var POST_URL = "CHANGEME";
// Test leory
// var POST_URL = "CHANGEME";

// Auction stuff
var AUCTION_END_TIME_HOURS = 21;
var DEFAULT_NOMINATOR_BID = 1;
var NOMINATOR_USER = "nominator";
var TIMEZONE = "GMT+1"

// Sheet stuff
var DRAFT_SUMMARY_SHEET_ID = 'CHANGEME';
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

// Nonsense
var END_OF_AUCTION_MSG = "A Lannister always pays his debts."
var GOOD_LUCK_MSG = "May the odds be ever in your favor."
var INVALID_BID_MSG = "Computer says no."
var GET_READY_MSG = "So many activities!"

// Form stuff
var BIDDING_CONFIRMATION_MESSAGE = "You can come back and edit you bid right up until the auction closes.\nMay the odds be ever in your favour."
var FORM_DESCRIPTION = `A receipt of your form submission will be sent to the specified email address.
You will need a valid email to bid - please use the same email for every auction - this will allow us to track budgets.

Live budgets can be found here: CHANGEME

Auction Rules:
- Starting budget is $10,000.
- The auction will close at 9pm GMT, at which point the form will lock.
- You can edit your bids as many times as you want.
- You need to draft a full roster (15 players) but it doesn't have to be a valid starting lineup.
- As soon as you have 15 players, your draft ends.                                   

Auction Format:
- Auctions are conducted using the Vickery Method.
- Bids are blind & sealed.
- The highest bidder wins but the price paid is the second-highest bid.
- Nominations are effectively a $1 bid from the nominating-team.

Auction Technical Details:
- Bids should be whole numbers - decimals will be rounded down.
- Max bid = remaining budget - num players needed to complete roster + 1
- If you bid more than your 'max bid' then your bid will be struck off. 
- If you win both auctions but cannot afford both players then the highest bid will take priority and your bids from the other player auction(s) will be stuck off.
- If you win both auctions with equal bids, the first listed auction will take priority.

Auction Results:
- Full results (who bid what) will be send to the Leroy Discord channel & draft summary spread sheet after auction closes.
- If you don't want to bid on a player, leave the player's box empty.
- If you don't want to bid on any players, don't even need to submit the form.

Auction Tie Breakers
- In the event of equal bids, a random winner will be selected from highest bidders.
`

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

  for (i = 0; i < players.length; i++) {
    var item = form.addTextItem().setTitle(players[i]);
    var validBid = FormApp.createTextValidation().setHelpText("Minimum bid is 2, max is <check spreadsheet>").requireNumberBetween(2, 10000).build();
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
  // Google's docs are shit. Subit don't work if you need emails or require sign in, and I can't supply them to the fake form response here.
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
  console.log("User '" + user + "' has a max bid of " + maxBidForUser + " and placed the following: " + bidValues);
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

// assumes bids are being passed in sorted from highest to lowest.
//function checkForWinnerTie(bids) {
    // Check to see if there is a tie, if there is, then randomly pick a winner.
//};

// I accept the description seperate since discord allow you to enrich this field with markdown
function postToDiscord(message, description, title) {
  var options = {
    "muteHttpExceptions": false,
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
    },
    "payload": JSON.stringify({
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
  console.log("Closing form for responses.")
  form.setAcceptingResponses(false);
  form.setCustomClosedFormMessage("Auction & bid submissions are now closed.");
};

// --------------------------------------- Formatting ---------------------------------------------

function formatBidsForDiscord(bids, player) {  
  var detailedBids = ""
  // There will always be atleast 1 bid since the opening bid is value=1 from the nominator and created when the form opens.
  for (var i = 0; i < bids.length; i++) {
    detailedBids += "$" + bids[i].bid + " - " + bids[i].user + " at " + Utilities.formatDate(bids[i].time, TIMEZONE, "HH:mm") + "\n"
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
