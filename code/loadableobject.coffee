class LoadableObject
    @load: (meta) ->
        self = new this()
        self.meta = meta
        return self

module.exports = LoadableObject