LoadableObject = require('./../loadableobject.coffee')

class Team extends LoadableObject
    @create: (id) ->
        {
            id: id
            jobs: []
        }

    onTick: ->
        console.log('Team onTick:')
        @meta.foo = 'bar'
        if !@meta.jobs.length
            @meta.jobs.push(1)

module.exports = Team
