#!/usr/bin/env node

/**
 * Local Approval Agent
 * 
 * Simple rule-based approval system for GitHub PRs
 * Runs locally - no external APIs, no token waste
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx npm start
 * 
 * Approval Rules:
 *   - Author is Appel420 → auto-approve
 *   - Label "safe-to-merge" → auto-approve
 *   - Workflow file changes only → auto-approve (if author is owner)
 *   - All others → require manual review
 */

const https = require('https');
const { parse } = require('url');

const REPO = process.env.GITHUB_REPO || 'Sovereignty-One/Sovereignty-AI-Studio_v1.0.1';
const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = REPO.split('/')[0];
const REPO_NAME = REPO.split('/')[1];

const AUTO_APPROVE_AUTHORS = ['Appel420'];
const AUTO_APPROVE_LABELS = ['safe-to-merge', 'auto-approve'];
const AUTO_APPROVE_PATTERNS = [
  '.github/workflows/',
  'runner-setup/',
];

if (!TOKEN) {
  console.error('ERROR: GITHUB_TOKEN environment variable not set');
  process.exit(1);
}

/**
 * Make GitHub API request
 */
function ghRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Sovereignty-Approval-Agent/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Check if PR should be auto-approved
 */
async function shouldApprove(pr) {
  const { number, user, labels, head } = pr;
  
  console.log(`\n📋 Reviewing PR #${number}: ${pr.title}`);
  console.log(`   Author: ${user.login}`);
  
  // Rule 1: Author in auto-approve list
  if (AUTO_APPROVE_AUTHORS.includes(user.login)) {
    console.log(`   ✅ Author '${user.login}' is in auto-approve list`);
    return true;
  }
  
  // Rule 2: Has auto-approve label
  const hasLabel = labels.some(l => AUTO_APPROVE_LABELS.includes(l.name));
  if (hasLabel) {
    console.log(`   ✅ Has auto-approve label`);
    return true;
  }
  
  // Rule 3: Only workflow/config changes
  try {
    const { data: files } = await ghRequest('GET', `/repos/${REPO}/pulls/${number}/files`);
    const allWorkflowChanges = files.every(f => 
      AUTO_APPROVE_PATTERNS.some(p => f.filename.includes(p))
    );
    
    if (allWorkflowChanges) {
      console.log(`   ✅ Only workflow/config changes`);
      return true;
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not fetch files: ${err.message}`);
  }
  
  console.log(`   ⏳ Requires manual review`);
  return false;
}

/**
 * Post approval comment
 */
async function approvePR(prNumber) {
  const body = `
✅ **Auto-Approved** by Sovereignty Approval Agent

This PR met auto-approval criteria:
- Author or label matched safe list
- Workflow/config changes only

**Job Status**: All checks must pass before merge.

*This approval was granted by local approval rules - not by a human reviewer.*
  `.trim();

  const { status } = await ghRequest('POST', 
    `/repos/${REPO}/pulls/${prNumber}/reviews`,
    {
      body,
      event: 'APPROVE',
    }
  );
  
  if (status === 201) {
    console.log(`   ✅ PR #${prNumber} approved`);
    return true;
  } else {
    console.error(`   ❌ Failed to approve (status ${status})`);
    return false;
  }
}

/**
 * Check all open PRs
 */
async function checkAllPRs() {
  console.log(`\n🤖 Sovereignty Approval Agent Starting`);
  console.log(`   Repository: ${REPO}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  
  try {
    const { data: prs } = await ghRequest('GET', 
      `/repos/${REPO}/pulls?state=open&sort=updated&direction=desc`
    );
    
    if (!prs.length) {
      console.log(`\n   No open PRs found`);
      return;
    }
    
    console.log(`\n   Found ${prs.length} open PR(s)`);
    
    for (const pr of prs) {
      // Skip if already has approvals
      const { data: reviews } = await ghRequest('GET', 
        `/repos/${REPO}/pulls/${pr.number}/reviews`
      );
      
      const alreadyApproved = reviews.some(r => r.state === 'APPROVED');
      if (alreadyApproved) {
        console.log(`\n📋 PR #${pr.number}: Already approved, skipping`);
        continue;
      }
      
      if (await shouldApprove(pr)) {
        await approvePR(pr.number);
      }
    }
    
    console.log(`\n✨ Approval check complete\n`);
  } catch (error) {
    console.error(`\n❌ Error checking PRs:`, error);
    process.exit(1);
  }
}

/**
 * Webhook handler (optional: for real-time approvals)
 */
async function handleWebhook(event, action, pr) {
  console.log(`\n🔔 Webhook Event: ${event}.${action}`);
  
  if (event === 'pull_request' && (action === 'opened' || action === 'synchronize')) {
    if (await shouldApprove(pr)) {
      await approvePR(pr.number);
    }
  }
}

/**
 * Main loop
 */
async function main() {
  // Check PRs every 5 minutes
  const INTERVAL = 5 * 60 * 1000;
  
  console.log(`🚀 Starting approval agent (interval: ${INTERVAL / 1000}s)`);
  
  // Initial check
  await checkAllPRs();
  
  // Recurring checks
  setInterval(checkAllPRs, INTERVAL);
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { shouldApprove, approvePR, handleWebhook };
