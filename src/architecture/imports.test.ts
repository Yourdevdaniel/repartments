import { describe, expect, it } from 'vitest'
import { importsOf } from './imports'
import { stripComments } from './text'

const specs = (path: string, text: string) => importsOf(path, text).map((r) => r.spec)

describe('importsOf', () => {
  it('reads every JavaScript and TypeScript import form, with its line', () => {
    const text = [
      "import React from 'react'",
      'import { useState, useEffect } from "react"',
      "import type { Lead } from './types'",
      "import './styles.css'",
      "export * from './models'",
      "export { Button } from '../ui/Button'",
      "const fs = require('node:fs')",
      "const lazy = import('./Chart')",
    ].join('\n')
    const refs = importsOf('src/App.tsx', text)
    expect(refs.map((r) => r.spec)).toEqual(['react', 'react', './types', './styles.css', './models', '../ui/Button', 'node:fs', './Chart'])
    expect(refs[0].line).toBe(1)
    expect(refs[7].line).toBe(8)
  })

  it('handles multi-line named imports and keeps line numbers', () => {
    const text = ['import {', '  createLead,', '  listLeads,', "} from '../services/leads'", "const after = require('x')"].join('\n')
    const refs = importsOf('src/routes/leads.ts', text)
    expect(refs).toEqual([
      { spec: '../services/leads', line: 1 },
      { spec: 'x', line: 5 },
    ])
  })

  it('ignores imports inside comments', () => {
    const text = ["// import old from 'nope'", "/* import x from 'also-nope' */", "import real from 'real'"].join('\n')
    expect(specs('a.ts', text)).toEqual(['real'])
  })

  it('reads Python absolute, dotted and relative imports', () => {
    const text = [
      'import os, json',
      'import crm.leads.views as views',
      'from crm.leads import models, forms',
      'from . import utils',
      'from .models import Lead',
      'from ..core.utils import helper',
    ].join('\n')
    const got = specs('backend/crm/leads/api.py', text)
    expect(got).toEqual(
      expect.arrayContaining(['os', 'json', 'crm.leads.views', 'crm.leads', 'crm.leads.models', 'crm.leads.forms', '.utils', '.models', '.models.Lead', '..core.utils', '..core.utils.helper']),
    )
  })

  it('ignores Python comments', () => {
    const text = ['# import hidden', 'import visible'].join('\n')
    expect(specs('x.py', text)).toEqual(['visible'])
  })

  it('reads Go single and block imports', () => {
    const text = ['package main', 'import "fmt"', 'import (', '  "net/http"', '  db "github.com/acme/app/internal/db"', ')'].join('\n')
    const refs = importsOf('main.go', text)
    expect(refs.map((r) => r.spec)).toEqual(['fmt', 'net/http', 'github.com/acme/app/internal/db'])
    expect(refs[1].line).toBe(4)
  })

  it('reads Java and Kotlin imports, including wildcards', () => {
    const text = ['package com.acme;', 'import com.acme.lead.Lead;', 'import static org.junit.Assert.assertEquals;', 'import com.acme.util.*', 'import kotlinx.coroutines.flow.Flow'].join('\n')
    expect(specs('src/Lead.java', text)).toEqual(['com.acme.lead.Lead', 'org.junit.Assert.assertEquals', 'com.acme.util', 'kotlinx.coroutines.flow.Flow'])
  })

  it('reads Ruby require and require_relative', () => {
    const text = ["require 'json'", "require_relative 'lib/lead'", 'require "sinatra/base"'].join('\n')
    expect(specs('app.rb', text)).toEqual(['json', './lib/lead', 'sinatra/base'])
  })

  it('reads PHP use, require_once and includes', () => {
    const text = ['<?php', 'use App\\Models\\Lead;', "require_once 'helpers.php';", 'use Illuminate\\Http\\Request as Req;'].join('\n')
    expect(specs('index.php', text)).toEqual(['helpers.php', 'App/Models/Lead', 'Illuminate/Http/Request'])
  })

  it('reads C# using directives', () => {
    expect(specs('Lead.cs', 'using System;\nusing Acme.Crm.Models;\nusing (var x = y) {}')).toEqual(['System', 'Acme.Crm.Models'])
  })

  it('returns nothing for unknown languages and empty input, and never throws', () => {
    expect(importsOf('readme.md', "import x from 'y'")).toEqual([])
    expect(importsOf('a.ts', '')).toEqual([])
    expect(() => importsOf('a.ts', "import '\u0000 \n import (")).not.toThrow()
  })
})

describe('stripComments', () => {
  it('keeps the line count and strings intact', () => {
    const out = stripComments('a // x\n/* y\nz */ b "// not a comment"', 'slash')
    expect(out.split('\n')).toHaveLength(3)
    expect(out).toContain('"// not a comment"')
    expect(out).not.toContain('x')
  })
})
