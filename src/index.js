import chalk from 'chalk'
import { exec, execSync } from 'child_process'
import template from 'lodash.template'
import fs from 'fs'
import path from 'path'

export function load (runfilePath, logger, requirer, access, exit) {
  let config

  // try to read package.json config
  try {
    config = requirer('./package.json').runjs || {}
  } catch (error) {
    config = {}
  }

  // try to load babel-register
  try {
    logger.log('Requiring babel-register...')
    if (config['babel-register']) {
      requirer(config['babel-register'])
    } else {
      requirer('./node_modules/babel-register')
    }
  } catch (error) {
    logger.log('Requiring failed. Fallback to pure node.')
    if (config['babel-register']) {
      throw error.stack
    }
  }

  // process runfile.js
  logger.log('Processing runfile...')

  try {
    access('./runfile.js')
  } catch (error) {
    logger.log(`No runfile.js defined in ${process.cwd()}`)
    exit(1)
  }

  const runfile = requirer('./runfile')
  return runfile
}

export function call (obj, args, cons = console) {
  let taskName = args[0]

  if (obj.default) {
    obj = obj.default
  }

  if (!taskName) {
    cons.log('Available tasks:')
    Object.keys(obj).forEach((t) => {
      cons.log(t)
    })
    return
  }

  Object.keys(obj).forEach((t) => {
    let task = obj[t]
    obj[t] = function () {
      let time = Date.now()
      cons.log(chalk.blue(`Running "${t}"...`))
      task.apply(null, arguments)
      time = ((Date.now() - time) / 1000).toFixed(2)
      cons.log(chalk.blue(`Finished "${t}" in ${time} sec`))
    }
  })

  let task = obj[taskName]
  if (task) {
    obj[taskName].apply(null, args.slice(1))
  } else {
    cons.log(chalk.red(`Task ${taskName} not found`))
  }
}

export function run (cmd, options = {}) {
  const binPath = path.resolve('./node_modules/.bin')

  // Pick relevant option keys and set default values
  options = {
    env: options.env || {},
    cwd: options.cwd,
    async: !!options.async,
    stdio: options.stdio || 'inherit',
    timeout: options.timeout
  }

  // Include in PATH node_modules bin path
  options.env.PATH = [binPath, options.env.PATH || process.env.PATH].join(path.delimiter)

  // Prepare options for exec commands (don't need async and stdio should have default value)
  const execOptions = Object.assign({}, options)
  delete execOptions.async
  if (execOptions.stdio === 'inherit') {
    delete execOptions.stdio
  }

  console.log(chalk.bold(cmd))

  // Handle async call
  if (options.async) {
    return new Promise((resolve, reject) => {
      const asyncProcess = exec(cmd, execOptions, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout)
        }
      })

      // Simulate stdio=inherit behaviour for exec async (exec doesn't handle stdio option)
      if (options.stdio === 'inherit') {
        asyncProcess.stdout.pipe(process.stdout)
      }
    })
  }

  // Handle sync call by default
  const execSyncBuffer = execSync(cmd, execOptions)

  if (options.stdio === 'inherit') {
    // execSync do handle stdio option, but when stdio=inherit, execSync returns null. We can fix that
    // by not passing stdio=inherit and writing outcome separately. Thanks to this stdout will be streamed and sync
    // run function will still return child process outcome.
    process.stdout.write(execSyncBuffer)
  }

  return execSyncBuffer.toString()
}

export function generate (src, dst, context) {
  console.log(`Generating ${dst} from template ${src}`)
  let templateString = fs.readFileSync(src)
  let content = template(templateString)(context)
  fs.writeFileSync(dst, content)
}
