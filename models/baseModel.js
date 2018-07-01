let pipeline = Promise.resolve();
module.exports = function () {
  return Object.create({
    pipe (p) {
      return new Promise(r => pipeline = pipeline.then(p).then(r))
    }
  })
}
