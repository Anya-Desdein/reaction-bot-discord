const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const interactions = require('./interactions');


function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const commandTags = {};
const reactReplyTo = {};
const reactHow = {};
const replyHow = {};

function readTxtFile(configDir, dir, file, fileName) {
  const lines = fs.readFileSync(path.join(`${configDir}/${dir}`, file), 'utf8')
  .split(/\r?\n/)
  .filter(line => line.trim());

    if (dir === 'reactReplyTo') {
      reactReplyTo[fileName] = lines.map(line => new RegExp(line));
    }
    if (dir === 'commandTags') {
      commandTags[fileName] = lines.map(line => new RegExp("!" + line.trim()));
    }
}

function readJsonFile(configDir, dir, file, fileName) {
  const jsonData = JSON.parse(fs.readFileSync(path.join(`${configDir}/${dir}/`, file), 'utf8'));
  if (dir === 'reactHow') reactHow[fileName] = jsonData;
  if (dir === 'replyHow') replyHow[fileName] = jsonData;
}

function readFolderContents(configDir, dir) {
  const files = fs.readdirSync(`${configDir}/${dir}`);
  files.forEach(file => {
    const extension = path.extname(file);
    const fileName = path.basename(file, extension);
    if (extension === '.txt') {
      readTxtFile(configDir, dir, file, fileName); 
    } else if (extension === '.json') { 
      readJsonFile(configDir, dir, file, fileName);
    }
  });
}

// Read files
['reactReplyTo', 'reactHow', 'replyHow', 'commandTags'].forEach(dir => {
  const configDirPath = 'config';
  readFolderContents(configDirPath, dir);
});

class BaseInteract {
  constructor() {}

  // Common matching function to find regex in the message content
  findMatch(msg, regexArray) {
    const messageContent = msg.content.toLowerCase();
    const sortedRegexArray = [...regexArray].sort((a, b) => b.toString().length - a.toString().length);
    const matchingRegex = sortedRegexArray.find(r => `${messageContent}`.match(r));
    if (matchingRegex) {
      return ` ${messageContent} `.match(matchingRegex);
    }
    return null;
}

  // This should be implemented by derived classes
  async processMatch(msg, match, responseArray) {
    throw new Error("This method should be implemented by the derived class");
}

  async interact(msg, triggerArray, responseArray) {
    const match = this.findMatch(msg, triggerArray);
    if (match) {
        return await this.processMatch(msg, match, responseArray);
    }
    return false;
  }

  //Specials in this context are placeholders you can add to your replies
  //There are 3 types of Specials: $match$, $person$ and $author$
  async replaceSpecials(msg, match, drawnReply) {

    let namePart;
    if (match[0].startsWith("!")) {
      const parts = msg.content.slice(match[0].length).trim();  // Just get the remainder of the message after the match.
      namePart = parts || msg.author.username;  // Use the remainder or default to the author's username.
      match[0] = match[0].slice(1);
    } else {
      namePart = msg.author.username;
    }

    const replacements = {
      "$match$": match[0],
      "$person$": namePart.charAt(0).toUpperCase() + namePart.slice(1),
      "$author$": msg.author.username
    };
  
    for (const [key, value] of Object.entries(replacements)) {
      drawnReply = drawnReply.split(key).join(value);
    }
    return drawnReply;
  }

}

class ReactInteract extends BaseInteract {
  async processMatch(msg, match, reactHowArray) {
    const randomReaction = reactHowArray[Math.floor(Math.random() * reactHowArray.length)];
    for (const el of randomReaction) {
      await sleep(600);
      await msg.react(el);
    }
    return true;
  }
}
  
class TagInteract extends BaseInteract {
  async processMatch(msg, match, replyHowArray) {
    let randomReply = replyHowArray[Math.floor(Math.random() * replyHowArray.length)];

    for (let item of randomReply) {
      item = await this.replaceSpecials(msg, match, item);
      item = item[0].toUpperCase() + item.substr(1);
      await sendTypingAndMessage(msg, item);
      return true;
    }
    return false;
  }
}

class ReplyInteract extends BaseInteract {
  async processMatch(msg, match, replyHowArray) {
    let randomReply = replyHowArray[Math.floor(Math.random() * replyHowArray.length)];

    for (let item of randomReply) {
      console.log(item);
      item = await this.replaceSpecials(msg, match, item);
      item = item[0].toUpperCase() + item.substr(1);
      await sendTypingAndMessage(msg, item);
      return true;
    }
    return false;
  }
}

async function sendTypingAndMessage(msg, messageContent) {
  msg.channel.startTyping();
  await sleep(1200);
  msg.channel.send(messageContent);
  msg.channel.stopTyping();
}

const client = new Discord.Client();

const reactInteractor = new ReactInteract();
const replyInteractor = new ReplyInteract();
const tagInteractor = new TagInteract();

//Message handling
client.on('message', async msg => {
  if (msg.author.bot) {
      return;
  }
  console.log(`Received message: ${msg.content}`);
  let hasInteracted = false;
  
  const interactionTypesOrder = ['react', 'tag', 'reply'];
  for (const interactionType of interactionTypesOrder) {
      for (const interaction of interactions.interactions) {
          if (interaction.type !== interactionType) continue;

          let queryDeclared = [];
          let replyDeclared = [];

          //Fill queryDeclared with regexes
          if (interaction.type === 'tag') {
            for (let queryKey of interaction.queries) { 
              if (commandTags[queryKey]) { 
                queryDeclared = [...queryDeclared, ...commandTags[queryKey]];
              }
            }
          } else if (interaction.type === 'react' || interaction.type === 'reply') {
            for (let queryKey of interaction.queries) {
              if (reactReplyTo[queryKey]) { 
                queryDeclared = [...queryDeclared, ...reactReplyTo[queryKey]];

              }
            }
          }

          //Fill replyDeclared with replies or reactions
          if (interaction.type === 'react') {
            for (let reactKey of interaction.replies) {
              if (reactHow[reactKey]) {
                replyDeclared = [...replyDeclared, ...reactHow[reactKey]];
              }
            }
          } else if (interaction.type === 'tag') {
            for (let tagKey of interaction.replies) {
              if (replyHow[tagKey]) {
                replyDeclared = [...replyDeclared, ...replyHow[tagKey]];
              } else if (reactHow[tagKey]) {
                replyDeclared = [...replyDeclared, ...reactHow[tagKey]];
              }
            }
          } else if (interaction.type === 'reply') {
            for (let replyKey of interaction.replies) {
              if (replyHow[replyKey]) {
                replyDeclared = [...replyDeclared, ...replyHow[replyKey]];
              }
            }
          }

          if (interaction.type === 'react') {
            console.log("Processing a react interaction");
            reactInteractor.interact(msg, queryDeclared, replyDeclared);
            console.log(hasInteracted);
          } else if (interaction.type === 'tag') {
            console.log("Processing a tag interaction");
            hasInteracted = await tagInteractor.interact(msg, queryDeclared, replyDeclared) || hasInteracted;
            console.log(hasInteracted);
          } else if (interaction.type === 'reply') {
            console.log("Processing a reply interaction");
            hasInteracted = await replyInteractor.interact(msg, queryDeclared, replyDeclared) || hasInteracted;
            console.log(hasInteracted);
          }
      }
      if (hasInteracted) return; // Exit if an interaction was found.
  }
});

console.log('React-reply-bot initialized');
client.login(process.env.DISCORD_BOT_TOKEN);