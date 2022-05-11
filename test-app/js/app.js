import { RubyApplication } from 'bormashino'

const main = async () => {
  const vm = await RubyApplication.initVm('/ruby.wasm', [
    'ruby.wasm',
    '-I/stub',
    '-I/gem/lib',
    '-EUTF-8',
    '-e_=0',
  ])

  vm.printVersion()
  vm.eval(`require_relative '/src/bootstrap.rb'`)

  document
    .querySelector('#bormashino-application')
    .addEventListener('bormashino:updated', (e) => {
      document.querySelector('#bormashino-updated-event').innerHTML =
        'dispatched: ' + Number(new Date())
    })

  const currentPath = () => location.href.replace(location.origin, '')
  RubyApplication.request('get', currentPath())
  RubyApplication.mount()

  window.bormashino = RubyApplication
}

main()
