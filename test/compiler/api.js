/* eslint-env node */

const fs = require('fs');
const path = require('path');
const test = require('tape');
const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
const getPort = require('get-port');

const {Compiler} = require('../../build/compiler');

test('throws if missing src/main.js', t => {
  const envs = ['development'];
  const dir = './test/fixtures/__non_existent__';
  t.throws(() => {
    new Compiler({envs: envs, dir});
  });
  t.end();
});

test('development/production env globals', async t => {
  const envs = ['development', 'production'];
  const dir = './test/fixtures/noop-test';

  const compiler = new Compiler({envs, dir});
  await compiler.clean();

  for (let i = 0; i < envs.length; i++) {
    const entryPath = `.fusion/dist/${envs[i]}/server/server-main.js`;
    const entry = path.resolve(dir, entryPath);

    const watcher = await new Promise((resolve, reject) => {
      const watcher = compiler.start((err, stats) => {
        if (err || stats.hasErrors()) {
          return reject(err || new Error('Compiler stats included errors.'));
        }

        return resolve(watcher);
      });
    });
    watcher.close();

    // Validate browser globals by file content
    const clientDir = path.resolve(dir, `.fusion/dist/${envs[i]}/client`);
    const assets = fs.readdirSync(clientDir);
    const clientEntry = assets.find(a => a.match(/^client-main.*\.js$/));
    const clientEntryPath = path.resolve(
      dir,
      `.fusion/dist/${envs[i]}/client/${clientEntry}`
    );
    const clientContent = fs.readFileSync(clientEntryPath, 'utf8');

    const expectedClientBrowser = {
      development: 'main __BROWSER__ is " + true',
      production: 'main __BROWSER__ is "+!0',
    };
    t.ok(
      clientContent.includes(expectedClientBrowser[envs[i]]),
      '__BROWSER__ is transpiled to be true'
    );

    const expectedClientNode = {
      development: 'main __NODE__ is " + false',
      production: 'main __NODE__ is "+!1',
    };
    t.ok(
      clientContent.includes(expectedClientNode[envs[i]]),
      '__NODE__ is transpiled to be false'
    );

    // Validate node globals by execution
    const command = `
      const assert = require('assert');
      const app = require('${entry}');
      assert.equal(typeof app.start, 'function', 'Entry has start function');
      app
        .start({port: ${await getPort()}})
        .then(server => {
          server.close();
        })
        .catch(e => {
          setImmediate(() => {
            throw e;
          });
        });
      `;
    try {
      const {stdout} = await exec(`node -e "${command}"`, {
        env: Object.assign({}, process.env, {
          NODE_ENV: 'production',
        }),
      });
      t.ok(
        stdout.includes('main __BROWSER__ is false'),
        'the global, __BROWSER__, is false'
      );
      t.ok(
        stdout.includes(`main __DEV__ is ${envs[i] === 'development'}`),
        `the global, __DEV__, is ${envs[i] === 'development'}`
      );
      t.ok(
        stdout.includes('main __NODE__ is true'),
        'the global, __NODE__, is true'
      );
    } catch (e) {
      t.ifError(e);
      t.end();
    }
  }
  t.end();
});

test('test env globals', async t => {
  const envs = ['test'];
  const dir = './test/fixtures/noop-test';

  const entryPath = `.fusion/dist/${envs[0]}/server/server-main.js`;
  const entry = path.resolve(dir, entryPath);
  const compiler = new Compiler({envs, dir});
  await compiler.clean();

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(entry), 'Entry file gets compiled');
  t.ok(fs.existsSync(entry + '.map'), 'Source map gets compiled');

  const clientDir = `.fusion/dist/${envs[0]}/client`;
  const clientEntry = path.resolve(dir, clientDir, 'client-main.js');
  t.ok(fs.existsSync(clientEntry), 'client .js');
  t.ok(fs.existsSync(clientEntry + '.map'), 'client .map');

  // server test bundle
  const serverCommand = `
    require('${entry}');
    `;
  try {
    const {stdout} = await exec(`node -e "${serverCommand}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production',
      }),
    });
    t.ok(
      stdout.includes('universal __BROWSER__ is false'),
      'the global, __BROWSER__, is false in universal tests'
    );
    t.ok(
      stdout.includes('universal __DEV__ is false'),
      'the global, __DEV__, is false in universal tests'
    );
    t.ok(
      stdout.includes('universal __NODE__ is true'),
      'the global, __NODE__, is true in universal tests'
    );
  } catch (e) {
    t.ifError(e);
  }

  // browser test bundle
  const browserCommand = `
    require('${clientEntry}');
    `;
  try {
    const {stdout} = await exec(`node -e "${browserCommand}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production',
      }),
    });
    t.ok(
      stdout.includes('browser __BROWSER__ is true'),
      'the global, __BROWSER__, is true in browser tests'
    );
    t.ok(
      stdout.includes('universal __BROWSER__ is true'),
      'the global, __BROWSER__, is true in universal tests'
    );
    t.ok(
      stdout.includes('browser __NODE__ is false'),
      'the global, __NODE__, is false in browser tests'
    );
    t.ok(
      stdout.includes('universal __NODE__ is false'),
      'the global, __NODE__, is false in universal tests'
    );
  } catch (e) {
    t.ifError(e);
  }

  t.end();
});

test('tests throw if no test files exist', t => {
  const envs = ['test'];
  const dir = './test/fixtures/noop';
  t.throws(() => {
    new Compiler({envs: envs, dir});
  });
  t.end();
});

test('generates error if missing default export', async t => {
  const envs = ['development'];
  const dir = './test/fixtures/empty';
  const entryPath = `.fusion/dist/${envs[0]}/server/server-main.js`;
  const entry = path.resolve(dir, entryPath);

  const compiler = new Compiler({envs, dir});
  await compiler.clean();
  t.ok(!fs.existsSync(entry), 'Cleans');

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(entry), 'Entry file gets compiled');

  const app = require(entry);
  t.ok(typeof app.start === 'function', 'Entry has start function');
  app
    .start({port: await getPort()})
    .then(server => {
      server.close();
      t.fail('Should not start server when missing default export');
    })
    .catch(() => t.pass('Should reject when missing default export'))
    .then(t.end);
});

test('dev works', async t => {
  const envs = ['development'];
  const dir = './test/fixtures/noop';
  const entryPath = `.fusion/dist/${envs[0]}/server/server-main.js`;
  const entry = path.resolve(dir, entryPath);

  const compiler = new Compiler({envs, dir});
  await compiler.clean();
  t.ok(!fs.existsSync(entry), 'Cleans');

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(entry), 'Entry file gets compiled');
  t.ok(fs.existsSync(entry + '.map'), 'Source map gets compiled');

  const command = `
    const assert = require('assert');
    const app = require('${entry}');
    assert.equal(typeof app.start, 'function', 'Entry has start function');
    (async () => {
      const server = await app.start({port: ${await getPort()}});
      server.close();
    })().catch(e => {
      setImmediate(() => {
        throw e;
      });
    });
    `;
  try {
    await exec(`node -e "${command}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'development',
      }),
    });
    t.end();
  } catch (e) {
    t.ifError(e);
    t.end();
  }
});

test('compiles with babel plugin', async t => {
  const envs = ['development'];
  const dir = './test/fixtures/custom-babel';
  const serverEntryPath = path.resolve(
    dir,
    `.fusion/dist/${envs[0]}/server/server-main.js`
  );
  const clientEntryPath = path.resolve(
    dir,
    `.fusion/dist/${envs[0]}/client/client-main.js`
  );

  const compiler = new Compiler({envs, dir});
  await compiler.clean();

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(clientEntryPath), 'Client file gets compiled');
  t.ok(fs.existsSync(serverEntryPath), 'Server file gets compiled');

  const clientEntry = fs.readFileSync(clientEntryPath, 'utf8');
  const serverEntry = fs.readFileSync(serverEntryPath, 'utf8');

  t.ok(
    clientEntry.includes('transformed_helloworld_custom_babel'),
    'custom plugin applied in client'
  );
  t.ok(
    serverEntry.includes('transformed_helloworld_custom_babel'),
    'custom plugin applied in server'
  );

  t.end();
});

test('production works', async t => {
  const envs = ['production'];
  const dir = './test/fixtures/noop';
  const entryPath = `.fusion/dist/${envs[0]}/server/server-main.js`;
  const entry = path.resolve(dir, entryPath);

  const compiler = new Compiler({envs, dir});
  await compiler.clean();
  t.ok(!fs.existsSync(entry), 'Cleans');

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(entry), 'Entry file gets compiled');
  t.ok(fs.existsSync(entry + '.map'), 'Source map gets compiled');

  const clientDir = path.resolve(dir, `.fusion/dist/${envs[0]}/client`);
  const assets = fs.readdirSync(clientDir);
  t.ok(assets.find(a => a.match(/^client-main.+\.js$/)), 'main .js');
  t.ok(assets.find(a => a.match(/^client-main.+\.js.map$/)), 'main .map');
  //t.ok(assets.find(a => a.match(/^client-main.+\.js.gz$/)), 'main .gz');
  t.ok(assets.find(a => a.match(/^client-main.+\.js.br$/)), 'main .br');
  t.ok(assets.find(a => a.match(/^client-vendor.+\.js$/)), 'vendor .js');
  t.ok(assets.find(a => a.match(/^client-vendor.+\.js.map$/)), 'vendor .map');
  //t.ok(assets.find(a => a.match(/^client-vendor.+\.js.gz$/)), 'vendor .gz');
  t.ok(assets.find(a => a.match(/^client-vendor.+\.js.br$/)), 'vendor .br');
  const command = `
    const assert = require('assert');
    const app = require('${entry}');
    assert.equal(typeof app.start, 'function', 'Entry has start function');
    app
      .start({port: ${await getPort()}})
      .then(server => {
        server.close();
      })
      .catch(e => {
        setImmediate(() => {
          throw e;
        });
      });
    `;
  try {
    await exec(`node -e "${command}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production',
      }),
    });
    t.end();
  } catch (e) {
    t.ifError(e);
    t.end();
  }
});

// TODO(#24): Is this how testing should work?
test('test works', async t => {
  const envs = ['test'];
  const dir = './test/fixtures/noop-test';
  const entryPath = `.fusion/dist/${envs[0]}/server/server-main.js`;
  const entry = path.resolve(dir, entryPath);

  const compiler = new Compiler({envs, dir});
  await compiler.clean();
  t.ok(!fs.existsSync(entry), 'Cleans');

  const watcher = await new Promise((resolve, reject) => {
    const watcher = compiler.start((err, stats) => {
      if (err || stats.hasErrors()) {
        return reject(err || new Error('Compiler stats included errors.'));
      }

      return resolve(watcher);
    });
  });
  watcher.close();

  t.ok(fs.existsSync(entry), 'Entry file gets compiled');
  t.ok(fs.existsSync(entry + '.map'), 'Source map gets compiled');

  const clientDir = `.fusion/dist/${envs[0]}/client`;
  const clientEntry = path.resolve(dir, clientDir, 'client-main.js');
  t.ok(fs.existsSync(clientEntry), 'client .js');
  t.ok(fs.existsSync(clientEntry + '.map'), 'client .map');

  // server test bundle
  const serverCommand = `
    require('${entry}');
    `;
  try {
    const {stdout} = await exec(`node -e "${serverCommand}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production',
      }),
    });
    t.ok(
      stdout.includes('server test runs'),
      'server test included in server test bundle'
    );
    t.ok(
      !stdout.includes('client test runs'),
      'client test not included in server test bundle'
    );
    t.ok(
      stdout.includes('universal test runs'),
      'universal test included in browser test bundle'
    );
  } catch (e) {
    t.ifError(e);
  }

  // browser test bundle
  const browserCommand = `
    require('${clientEntry}');
    `;
  try {
    const {stdout} = await exec(`node -e "${browserCommand}"`, {
      env: Object.assign({}, process.env, {
        NODE_ENV: 'production',
      }),
    });
    t.ok(
      !stdout.includes('server test runs'),
      'server test not included in browser test bundle'
    );
    t.ok(
      stdout.includes('client test runs'),
      'client test included in browser test bundle'
    );
    t.ok(
      stdout.includes('universal test runs'),
      'universal test included in browser test bundle'
    );
  } catch (e) {
    t.ifError(e);
  }

  t.end();
});
