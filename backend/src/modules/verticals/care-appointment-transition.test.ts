import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCareAppointmentTransition,
  assertCareAppointmentPatchTransition
} from './care-appointment-transition.js';

test('valid ambulatory transitions progress through one server state machine', () => {
  for (const [before, after] of [
    ['waitlisted','scheduled'],['scheduled','confirmed'],['scheduled','checked_in'],
    ['confirmed','checked_in'],['checked_in','in_progress'],['in_progress','completed'],
    ['scheduled','cancelled'],['confirmed','no_show']
  ]) assert.doesNotThrow(() => assertCareAppointmentTransition(before, after), `${before} -> ${after}`);
});

test('skips, reversals and changes after a terminal status are rejected', () => {
  for (const [before, after] of [
    ['waitlisted','checked_in'],['scheduled','completed'],['confirmed','in_progress'],
    ['checked_in','confirmed'],['cancelled','checked_in'],['completed','scheduled'],
    ['no_show','in_progress']
  ]) assert.throws(() => assertCareAppointmentTransition(before, after), `${before} -> ${after}`);
});

test('generic PATCH cannot bypass check-in/encounter/discharge authorities', () => {
  assert.doesNotThrow(() => assertCareAppointmentPatchTransition('scheduled','confirmed'));
  assert.doesNotThrow(() => assertCareAppointmentPatchTransition('waitlisted','scheduled'));
  for (const [before, after] of [
    ['scheduled','checked_in'],['checked_in','in_progress'],['in_progress','completed'],
    ['completed','completed'],['cancelled','cancelled']
  ]) assert.throws(() => assertCareAppointmentPatchTransition(before, after));
});
