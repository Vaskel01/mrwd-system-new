import test from 'node:test'
import assert from 'node:assert/strict'
import { attachRequesterContacts } from '../src/lib/serviceAccountReview.js'

const commercial = { role: 'admin', department_code: 'COMMERCIAL', division_code: 'NSCCCD', staff_position: 'staff' }
test('requester contacts require billing capability before any privileged query', async () => {
  for (const user of [{role:'customer'}, {role:'maintenance_personnel'}, {role:'admin',department_code:'ECMD',division_code:'WDLCD'}, {role:'admin',staff_position:'supervisor'}]) {
    await assert.rejects(attachRequesterContacts({ user, requests: [], admin: null }), /billing access required/)
  }
})
test('contact projection only queries pending requester ids and returns three contact fields', async () => {
  const calls = []
  const admin = { from(table) { calls.push(table); return this }, select(fields) { calls.push(fields); return this }, in(field, ids) { calls.push([field,ids]); return this }, async eq(field,value) { calls.push([field,value]); return {data:[{id:'one',full_name:'QA',email:'qa@example.invalid',phone:null,role:'customer',secret:'never return'}]} } }
  const rows = await attachRequesterContacts({user:commercial,admin,requests:[{id:'request',customer_id:'one',status:'pending'},{id:'old',customer_id:'two',status:'approved'}]})
  assert.deepEqual(calls,['profiles','id,full_name,email,phone',['id',['one']],['role','customer']])
  assert.deepEqual(rows,[{id:'request',customer_id:'one',status:'pending',customer:{full_name:'QA',email:'qa@example.invalid',phone:null}}])
})
test('requester lookup does not silently return missing identities during an outage', async () => {
  await assert.rejects(attachRequesterContacts({user:commercial,requests:[{status:'pending',customer_id:'one'}],admin:null}),/temporarily unavailable/)
  assert.deepEqual(await attachRequesterContacts({user:commercial,requests:[],admin:null}),[])
})
