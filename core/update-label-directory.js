// Import modules
const fs = require('fs');
const path = require('path');
const { logger } = require('../shared/format-log-messages');

// Global variables
const BREAKLINE = `-`.repeat(60);
const DELETED_LABEL_ID = '9999999999';
const NEW_LABEL_PREFIX = 'NEW-';



/**
 * Function triggered by `update-label-directory.yml` that 
 * updates the "Label Object" in `label-directory.json` 
 *
 * @param {Object} github     - GitHub object from actions/github-script
 * @param {Object} context    - context object from actions/github-script
 * @param {Object} config     - configuration object
 * @returns {Object}
 */
async function main({ github: g, context: c, config: cfg }) {

  const github = g;
  const context = c;
  const config = cfg;

  const FILEPATH = path.resolve(__dirname, '../github-actions/workflow-configs/_data/label-directory.json');

  const labelId = context.payload.label.id;
  const labelName = context.payload.label.name;
  let labelAction = context.payload.action;
  let labelKey = '';
  let actionAddOn = '';
  let message = '';

  // If label 'edited' but changes do not include 'name', label directory is not updated and workflow exits
  if (labelAction === 'edited' && !context.payload.changes.name) {
    logger.log(`${BREAKLINE}\n`);
    logger.log(`${labelName} label changed:`);
    logger.log(context.payload.changes);
    logger.log(`\n${BREAKLINE}\n`);
    labelAction = "no update";
    labelKey = null;
    message = `Edit to description and/or color only, no updates to JSON or SoT`;
    logger.log(message);
    return {labelAction, labelKey, labelName, labelId, message};
  }

  // Otherwise, retrieve label directory 
  let data;
  try {
    const rawData = fs.readFileSync(FILEPATH, 'utf8');
    data = JSON.parse(rawData);
  } catch (err) {
    throw new Error(`Error reading or parsing label directory JSON file: ${err.message}`);
  }

  // Initial information to log
  logger.log(`${BREAKLINE}\n`);
  logger.log(`Label reference info:`);
  logger.log(context.payload.label);
  logger.log(`\n${BREAKLINE}\n`);

  // If label 'deleted', check for 'labelId' in label directory and if found return 'labelKey' 
  if (labelAction === 'deleted') {
    labelKey = cycleThroughDirectory(data, Number(labelId));
    if (labelKey) {
      // If the 'labelKey' is found with 'labelId', replace with 'DELETED_LABEL_ID' in JSON and flag for review
      let prevId = labelId;
      labelId = DELETED_LABEL_ID;
      message = `Found labelKey:  ${labelKey}  for labelName:  ${labelName}  using labelId:  ${prevId}  --->  ${labelId}.  Id no longer valid. This needs review!`;
      actionAddOn = ' / id found';
      logger.log(message);
      writeToJsonFile(data, labelKey, labelId, labelName);
    } else {
      // If the 'labelKey' not found with 'labelId', rerun with 'labelName'
      labelKey = cycleThroughDirectory(data, labelName);
      if (labelKey) {
        message = `Found a labelKey:  ${labelKey}  for labelName:  ${labelName}.  However, this DOES NOT MATCH labelId:  ${labelId}.  No updates to JSON. This needs review!`;
        logger.log(message);
        actionAddOn = ' / check name';
      } else {
        message = `Found neither labelName:  ${labelName}  nor labelId:  ${labelId}.  No updates to JSON. This needs review!`;
        logger.log(message);
        actionAddOn = ' / not found';
      }
    }
  }

  // If 'edited' check for 'labelId' in label directory and if found return 'labelKey' 
  if (labelAction === 'edited' ) {
    let prevName = context.payload.changes?.name?.from;
    labelKey = cycleThroughDirectory(data, Number(labelId));
    // If the 'labelKey' is returned, it is assumed that the change is known. Label directory will be updated w/ new 'name'
    if (labelKey) {
      message = `Found labelKey:  ${labelKey}  for labelName:   ${prevName} ---> ${labelName}   and labelId:  ${labelId}.`;
      actionAddOn = ' / found';
    } else {
      // If the 'labelId' is not found, create a new 'labelKey' and flag this label edit for review
      labelKey = createInitialLabelKey(data, labelName);
      message = `Did not find labelKey:   for labelName:  ${labelName}  using labelId:  ${labelId}.  Adding Label Object with new labelKey:  ${labelKey}.`;
      actionAddOn = ' / added';
    }
    logger.log(message);
    writeToJsonFile(data, labelKey, labelId, labelName);
  }

  // If 'created' then 'labelKey' won't exist, create new camelCased 'labelKey' so label entry can be added to directory
  if (labelAction === 'created') {
    labelKey = createInitialLabelKey(labelName);
    message = `Created initial labelKey:  ${labelKey}  for new labelName:  ${labelName}  and new labelId:  ${labelId}.  Adding Label Object to JSON.`;
    logger.log(message);
    writeToJsonFile(data, labelKey, labelId, labelName);
  }

  // Final step is to return label data packet to workflow
  logger.log(`\nSending  Label Object  to Google Apps Script / Sheets file`);
  labelAction += actionAddOn;
  return { labelAction, labelKey, labelName, labelId, message };
}



/**
 *  HELPER FUNCTIONS for main()
 *
 */
function cycleThroughDirectory(data, searchValue) {
  for (let [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.includes(searchValue)) {
      return key;
    }
  }
  return undefined;
}



// If the label has not been created, prepend NEW_LABEL_PREFIX to labelKey to flag it
function createInitialLabelKey(labelName) {
  let labelKey = NEW_LABEL_PREFIX;
  const isAlphanumeric = str => /^[a-z0-9]+$/gi.test(str);
  let labelInterim = labelName.split(/[^a-zA-Z0-9]+/);
  for (let i = 0; i < labelInterim.length ; i++) {
      if (i === 0) {
          labelKey += labelInterim[0].toLowerCase();
      } else if (isAlphanumeric(labelInterim[i])) {
          labelKey += labelInterim[i].split(' ').map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      }
  }
  return labelKey;
}



function writeToJsonFile(data, labelKey, labelId, labelName) {
  data[labelKey] = [labelName, Number(labelId)];
  logger.log(`\nStaging  Label Object  to JSON:\n   { "${labelKey}": [ "${labelName}", "${labelId}" ] }`);

  // Write data file in prep for committing changes to label directory
  try {
    fs.writeFileSync(FILEPATH, JSON.stringify(data, null, 2));
    logger.log(`${BREAKLINE}\n`);
    logger.log(`Changes to Label Directory JSON file have been staged. Next step will commit changes.`);
  } catch (err) {
    throw new Error(`Error writing to label directory JSON file: ${err.message}`);
  }
}



module.exports = main;
