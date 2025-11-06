#!/usr/bin/env node
/**
 * script to switch guest user role for testing permissions
 */

import { readFileSync, writeFileSync } from 'fs';

const roleConfig = {
  consumer: {
    groups: '[api-consumers]',
    rbacRole: 'role:default/api-consumer',
    name: 'API Consumer',
  },
  owner: {
    groups: '[api-owners]',
    rbacRole: 'role:default/api-owner',
    name: 'API Owner',
  },
  default: {
    groups: '[api-owners, api-consumers]',
    rbacRole: 'role:default/api-owner',
    name: 'default (all permissions)',
  },
};

const role = process.argv[2];

if (!role || !roleConfig[role]) {
  console.error('usage: node switch-user-role.mjs {consumer|owner|default}');
  process.exit(1);
}

const config = roleConfig[role];

// update kuadrant-users.yaml - only guest user
const userFile = 'catalog-entities/kuadrant-users.yaml';
let userContent = readFileSync(userFile, 'utf8');

// find guest user block and replace memberOf
// match from "name: guest" through to memberOf line
const guestPattern = /(name: guest[\s\S]*?memberOf: )\[.*?\]/;
userContent = userContent.replace(guestPattern, `$1${config.groups}`);

writeFileSync(userFile, userContent, 'utf8');

// update rbac-policy.csv
const rbacFile = 'rbac-policy.csv';
let rbacContent = readFileSync(rbacFile, 'utf8');

// replace guest user role assignment
rbacContent = rbacContent.replace(
  /g, user:default\/guest, role:default\/.*/,
  `g, user:default/guest, ${config.rbacRole}`
);

writeFileSync(rbacFile, rbacContent, 'utf8');

// update app-config.local.yaml
const appConfigFile = 'app-config.local.yaml';
let appConfigContent = readFileSync(appConfigFile, 'utf8');

if (role === 'default') {
  // restore guest to admin/superUsers lists
  // add to users list if not present
  if (!appConfigContent.includes('- name: user:default/guest')) {
    appConfigContent = appConfigContent.replace(
      /(users:\n(?:\s+- name: [^\n]+\n)+)/,
      '$1        - name: user:default/guest\n'
    );
    // add to superUsers list if not present
    appConfigContent = appConfigContent.replace(
      /(superUsers:\n(?:\s+- name: [^\n]+\n)+)/,
      '$1        - name: user:default/guest\n'
    );
  }
} else {
  // ensure guest is NOT in admin or superUsers lists (remove if present)
  // must preserve the newline for the next line
  appConfigContent = appConfigContent.replace(
    /^        - name: user:default\/guest\n/gm,
    ''
  );
}

writeFileSync(appConfigFile, appConfigContent, 'utf8');

console.log(`switched to ${config.name} role. restart with: yarn dev`);
