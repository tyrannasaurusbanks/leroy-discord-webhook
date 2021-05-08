Inspired by [Google forms to discord](https://github.com/Iku/Google-Forms-to-Discord).

# What (words)
Ugly javascript which:
* Automates creation of google forms for daily fantasty football auctions
* Sends auction/form links, reminders & end summary/winners to a discord channel
* Read/Writes auction state and team rosters/budgets to a google sheet.

# What (pictures)
<img width="505" alt="Screenshot 2021-05-08 at 15 33 48" src="https://user-images.githubusercontent.com/2912093/117543014-426d5880-b01b-11eb-86ee-c8d8f31b1bb6.png">
<img width="465" alt="Screenshot 2021-05-04 at 20 20 29" src="https://user-images.githubusercontent.com/2912093/117058248-af80a580-ad1e-11eb-85b6-00a3f9b85740.png">
<img width="972" alt="Screenshot 2021-05-04 at 20 22 11" src="https://user-images.githubusercontent.com/2912093/117058362-d212be80-ad1e-11eb-97ba-a5a01559e28b.png">
<img width="546" alt="Screenshot 2021-05-04 at 20 17 44" src="https://user-images.githubusercontent.com/2912093/117058019-6e889100-ad1e-11eb-87c2-ff3ee750f543.png">
<img width="1326" alt="Screenshot 2021-05-04 at 20 20 46" src="https://user-images.githubusercontent.com/2912093/117059782-721d1780-ad20-11eb-9e46-86d983cc4707.png">
<img width="836" alt="Screenshot 2021-05-04 at 20 35 07" src="https://user-images.githubusercontent.com/2912093/117059925-a1338900-ad20-11eb-9a45-8fbb20b0fcce.png">

# Why
Used for Casa Del Leroy Fantasy Football league to conduct daily [Vickery blind-auctions](https://en.wikipedia.org/wiki/Vickrey_auction) for a slow Fantasy football draft.
We were converting from redraft to dyansty & we thought we'd do something special for the startup auction whilst lock down was going on.

# How
This section will be a guide for a Leroy on how to create form (any special formatting), how to attach the script, any options to toggle on form.

## Form info
Daily auction are created from a auctions sheet. The nomination list needs to be in the following format:
```
| playerA | playerB | auction date - dd/mm/yyyy | form-url - this will be filled in by script |
| Tom Brady |	Cam Newton |	4/20/2020 |	https://docs.google.com/forms/d/<UID>/edit |
```
PlayerA and auction date a mandatory.

Running createWeeklyAuctionForms() will:
* read all the auctions entries from a google sheet tab
* filter out ones which already have a form (as evident by presence of a form-url)
* create a form for playerA (and playerB if present)
* attach a onSubmit() trigger to the form which will log bids as they come in (for audit purposes in case some jackass disputes)
* attach a datetime trigger to close & summarise the auction at a set time
* submit a dummy $1 bid in place of the person who nominated the players
* post a link of all auctions created to discord.

We run this once a week:
* we take nominations in a free form on Sunday day
* format them into 1 or 2 player per-day in the auctions sheet
* run the script to create auctions for the coming week.

## End of day summaries
The timer trigger assigned to the forms at creation are scheduled to run the function endDailyAuctions() on the day which auction finishes.
It will read the auctions list, filter out any not ending today (the date the script is running), and will order the bids, find a winner, and send a summary to discord.

It' all write results to a separate tab in th summary spreadsheet in the following format:
```
| user |	player |	bid |	time |	win |
| bidder@gmail.com	| Justin Jackson|	1	| 4/16/2020	| |
```

## Summary note for the auction
```
A receipt of your form submission will be sent to the specified email address.
You will need a valid email to bid - please use the same email for every auction - this will allow us to track budgets.

Live budgets can be found here: <link to google sheet>

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
- In the event of equal bids, earliest bid wins.```
```

## Useful
This was super useful: https://leovoel.github.io/embed-visualizer/
