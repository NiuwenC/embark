import { __ } from 'embark-i18n';
const async = require('async');
// async._waterfall = async.waterfall;
// let filename = "index.js";
// async.waterfall = function (_tasks, callback) {
//   let tasks = _tasks.map(function (t) {
//     let fn = function () {
//       console.log("async " + (new Error()).stack.split("\n")[1] + ": " + t.name);
//       t.apply(t, arguments);
//     };
//     return fn;
//   });
//   async._waterfall(tasks, callback);
// };

const ContractDeployer = require('./contract_deployer.js');
const cloneDeep = require('clone-deep');
const constants = require('embark-core/constants');

class DeployManager {
  constructor(embark, options) {
    const self = this;
    this.config = embark.config;
    this.logger = embark.logger;
    this.blockchainConfig = this.config.blockchainConfig;

    this.events = embark.events;
    this.plugins = options.plugins;
    // this.blockchain = options.blockchain;
    // this.gasLimit = 6000000;
    this.fatalErrors = false;
    this.deployOnlyOnConfig = false;
    this.onlyCompile = options.onlyCompile !== undefined ? options.onlyCompile : false;

    this.contractDeployer = new ContractDeployer({
      logger: this.logger,
      events: this.events,
      plugins: this.plugins
    });

    this.events.setCommandHandler('deployment:contracts:deploy', (contractsList, contractDependencies, cb) => {
      self.deployContracts(contractsList, contractDependencies, cb);
    });

    // this.events.setCommandHandler('deploy:setGasLimit', (gasLimit) => {
    //   self.gasLimit = gasLimit;
    // });

    // this.events.setCommandHandler('deploy:contracts', (cb) => {
    //   self.deployContracts(cb);
    // });

    // this.events.setCommandHandler('deploy:contracts:test', (cb) => {
    //   self.fatalErrors = true;
    //   self.deployOnlyOnConfig = true;
    //   self.deployContracts(cb);
    // });
  }

  deployAll(contracts, contractDependencies, done) {
    let self = this;

    // self.events.request('contracts:dependencies', (err, contractDependencies) => {
    // self.events.request('contracts:list', (err, contracts) => {
    // if (err) {
    // return done(err);
    // }

    self.logger.info(__("deploying contracts"));
    async.waterfall([
      function (next) {
        self.logger.info(__('Executing pre-deploy actions...'));
        self.plugins.emitAndRunActionsForEvent("deploy:beforeAll", (err) => {
          // console.dir("== err")
          // console.dir(err)
          // TODO: err is a function for some reason
          // if (err) {
          // return next(err);
          // }
          self.logger.info(__('Pre-deploy actions done. Deploying contracts'));
          next();
        });
      },
      function (next) {
        const contractDeploys = {};
        const errors = [];
        console.dir("=== contracts")
        console.dir(contracts.map((x) => x.className))
        contracts.forEach(contract => {
          function deploy(result, callback) {
            if (typeof result === 'function') {
              callback = result;
            }
            // contract._gasLimit = self.gasLimit;
            self.events.request('deploy:contract', contract, (err) => {
              console.dir("contract deployed " + contract.className)
              if (err) {
                console.dir("== err deploying contract");
                console.dir(err);
                contract.error = err.message || err;
                if (contract.error === constants.blockchain.gasAllowanceError) {
                  self.logger.error(`[${contract.className}]: ${constants.blockchain.gasAllowanceErrorMessage}`);
                } else {
                  self.logger.error(`[${contract.className}]: ${err.message || err}`);
                }
                errors.push(err);
              }
              callback();
            });
          }

          const className = contract.className;
          if (!contractDependencies[className] || contractDependencies[className].length === 0) {
            contractDeploys[className] = deploy;
            return;
          }
          contractDeploys[className] = cloneDeep(contractDependencies[className]);
          contractDeploys[className].push(deploy);
        });

        console.dir("== async.auto");
        console.dir(Object.keys(contractDeploys));
        console.dir(contractDeploys);
        async.auto(contractDeploys, function (_err, _results) {
          if (_err) {
            console.dir("error deploying contracts")
            console.dir(_err)
          }
          if (errors.length) {
            _err = __("Error deploying contracts. Please fix errors to continue.");
            self.logger.error(_err);
            self.events.emit("outputError", __("Error deploying contracts, please check console"));
            return next(_err);
          }
          if (contracts.length === 0) {
            self.logger.info(__("no contracts found"));
            return next();
          }
          self.logger.info(__("finished deploying contracts"));
          next(err);
        });
      }
    ], (err) => {
      console.dir("==== finished deploying")
      if (err) {
        self.logger.error(err);
      }
      done(err);
    });
    // });
    // });
  }

  // TODO: can be merged into deployAll
  deployContracts(contractsList, contractDependencies, done) {
    let self = this;

    // if (self.blockchainConfig === {} || self.blockchainConfig.enabled === false) {
    //   self.logger.info(__("Blockchain component is disabled in the config").underline);
    //   this.events.emit('blockchainDisabled', {});
    //   return done();
    // }

    async.waterfall([
      // function requestBlockchainConnector(callback) {
      //   self.events.request("blockchain:object", (blockchain) => {
      //     self.blockchain = blockchain;
      //     callback();
      //   });
      // },

      // function buildContracts(callback) {
      //   self.events.request("contracts:build", self.deployOnlyOnConfig, (err) => {
      //     callback(err);
      //   });
      // },

      // // TODO: shouldn't be necessary
      // function checkCompileOnly(callback) {
      //   if (self.onlyCompile) {
      //     self.events.emit('contractsDeployed');
      //     return done();
      //   }
      //   return callback();
      // },

      // // TODO: could be implemented as an event (beforeDeployAll)
      // function checkIsConnectedToBlockchain(callback) {
      //   self.blockchain.onReady((err) => {
      //     callback(err);
      //   });
      // },

      // // TODO: this can be done on the fly or as part of the initialization
      // function determineDefaultAccount(callback) {
      //   self.blockchain.determineDefaultAccount((err) => {
      //     callback(err);
      //   });
      // },

      function deployAllContracts(callback) {
        self.deployAll(contractsList, contractDependencies, function (err) {
          if (!err) {
            self.events.emit('contractsDeployed');
          }
          if (err && self.fatalErrors) {
            return callback(err);
          }
          callback();
        });
      },
      function runAfterDeploy(callback) {
        self.plugins.emitAndRunActionsForEvent('contracts:deploy:afterAll', callback);
      }
    ], function (err, _result) {
      done(err);
    });
  }

}

module.exports = DeployManager;