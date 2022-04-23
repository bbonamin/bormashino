import { WASI } from '@wasmer/wasi'
import { WasmFs } from '@wasmer/wasmfs'
import { RubyVM } from 'ruby-head-wasm-wasi/dist/index.js'
import rubyDigest from './ruby-digest.js'

const vm = new RubyVM()

// JSでの値をRubyでの値に変換する
const toRbValue = (v) => {
  const utils = vm.eval('Bormashino::Utils')
  const input = encodeURIComponent(JSON.stringify(v))
  return utils.call('to_rb_value', vm.eval("'" + input + "'"))
}

const applyServerResult = (serverRet) => {
  const ret = JSON.parse(serverRet.toJS())
  console.log(ret)
  const target = document.querySelector('#display')
  switch (ret[0]) {
    case 200:
      target.innerHTML = ret[2][0]
      hookTransitionElements()
      break

    case 302:
      const loc = new URL(ret[1]['Location'])
      const path = loc.pathname + loc.search
      requestToServer('get', path)
      break
  }
}

const requestToServer = (method, path, payload) => {
  const server = vm.eval('Bormashino::Server')
  let ret

  switch (method) {
    case 'get':
      ret = server.call('get', toRbValue(path))
      break

    case 'post':
      ret = server.call('post', toRbValue(path), toRbValue(payload))
      break
  }

  applyServerResult(ret)
}

const formSubmitHook = (e) => {
  e.preventDefault()
  const form = e.target
  const action = form.action
  const payload = new URLSearchParams(new FormData(form)).toString()

  const server = vm.eval('Bormashino::Server')
  const ret = server.call(
    'post',
    toRbValue(new URL(action).pathname),
    toRbValue(payload)
  )
  applyServerResult(ret)
}

const hookTransitionElements = () => {
  Array.from(document.querySelectorAll('form')).forEach((f) => {
    f.addEventListener('submit', formSubmitHook, false)
  })
}

const main = async () => {
  // Fetch and instntiate WebAssembly binary
  const rubyModule = await WebAssembly.compileStreaming(
    fetch('/ruby.' + rubyDigest + '.wasm')
  )

  const wasmFs = new WasmFs()
  const wasi = new WASI({
    bindings: Object.assign(Object.assign({}, WASI.defaultBindings), {
      fs: wasmFs.fs,
    }),
  })
  const originalWriteSync = wasmFs.fs.writeSync.bind(wasmFs.fs)
  wasmFs.fs.writeSync = function () {
    let fd = arguments[0]
    let text
    if (arguments.length === 4) {
      text = arguments[1]
    } else {
      let buffer = arguments[1]
      text = new TextDecoder('utf-8').decode(buffer)
    }
    const handlers = {
      1: (line) => console.log(line),
      2: (line) => console.warn(line),
    }
    if (handlers[fd]) handlers[fd](text)
    return originalWriteSync(...arguments)
  }

  const imports = {
    wasi_snapshot_preview1: wasi.wasiImport,
  }
  vm.addToImports(imports)
  const instance = await WebAssembly.instantiate(rubyModule, imports)
  await vm.setInstance(instance)
  wasi.setMemory(instance.exports.memory)
  instance.exports._initialize()
  vm.initialize(['ruby.wasm', '-I/stub', '-EUTF-8', '-e_=0'])

  vm.printVersion()
  vm.eval(`
    ENV['GEM_HOME'] = '/src/bundle/ruby/3.2.0+1'
    require 'js'
    require 'json/pure'
    require_relative '/src/bormashino.rb'
    require_relative '/src/bootstrap.rb'
  `)

  requestToServer('get', '/', null)
}

main()
