import assert from 'assert';
import sinon from 'sinon';
import { fakeEmbark } from 'embark-testing';
import CodeRunner from '../src/';

// Due to our `DAPP_PATH` dependency in `embark-utils` `dappPath()`, we need to
// ensure that this environment variable is defined.
process.env.DAPP_PATH = 'something';

describe('core/code-runner', () => {

  const { embark, plugins } = fakeEmbark();

  let codeRunner, doneCb;

  beforeEach(() => {
    codeRunner = new CodeRunner(embark);
    doneCb = sinon.fake();
  });

  afterEach(() => {
    embark.teardown();
    sinon.restore();
  });

  test('it should register variables and eval code in the VM', async () => {
    const testVar = {
      foo: 'bar'
    };
    await embark.events.request2('runcode:register', 'testVar', testVar);
    const context = await embark.events.request2('runcode:getContext');
    assert.equal(context['testVar'], testVar);
  });

  test('it should run code in the VM', async () => {
    const testVar = {
      foo: 'bar'
    };
    await embark.events.request2('runcode:register', 'testVar', testVar);
    // `runcode:eval` throws a `ReferenceError` if `testVar` wasn't registered
    // in the VM.
    await embark.events.request2('runcode:eval', `testVar.foo = 'bar';`);
  });
});

