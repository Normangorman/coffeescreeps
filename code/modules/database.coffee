Log = require("./../log.coffee")
log = new Log("database", "#988aff")
Test = require("./../test.coffee")
Util = require("./../util.coffee")
Structs = require("./../structs.coffee")

class Database
    @initSection: (sectionParts) ->
        ptr = Memory.db
        log.debug("initSection: ", sectionParts)
        for i in [0...sectionParts.length]
            section = sectionParts[i]
            #log.debug("i", i, "section", section, "ptr[section]", ptr[section])

            if i == sectionParts.length - 1 and ptr[section]
                ptr[section] = null

            if not ptr[section]
                ptr[section] = {}

            ptr = ptr[section]

        return ptr

    @getSection: (sectionParts) ->
        ptr = Memory.db
        for section in sectionParts
            ptr = ptr[section]
            if ptr == undefined then return
        ptr

    @getTable: (tableName) -> @getSection(tableName.split('.'))

    @createTable: (tableName) ->
        table = @initSection(tableName.split("."))
        table.list = Structs.OrderedList.create("id")
        table.nextId = 1
        table

    @hasTable: (tableName) -> Boolean(@getTable(tableName))

    @insert: (tableName, obj) ->
        log.debug("tableName", tableName, "obj", obj)
        if not _.isObject(obj)
            log.error("Trying to insert a non-object into table #{tableName}", obj)
            return

        table = @getTable(tableName)
        obj.id = table.nextId++
        list = Structs.OrderedList.load(table.list)
        log.debug("table", table, "list", list)
        list.insert(obj)
        return obj.id # for convenience

    @delete: (tableName, id) ->
        table = @getTable(tableName)
        list = Structs.OrderedList.load(table.list)
        return list.delete({id: id})

    @query: (tableName, predicate) ->
        table = @getTable(tableName)
        list = Structs.OrderedList.load(table.list)
        results = _.filter(list.items(), predicate)
        results

    @retrieve: (tableName, id) ->
        table = @getTable(tableName)
        list = Structs.OrderedList.load(table.list)
        list.lookup({id: id})

    @onTick: ->
        log.debug("running")
        if not Memory.db then Memory.db = {}

    @test: (verbose=true) ->
        suite = new Test.TestSuite("database", verbose)
        suite.newSet("initSection")
        @initSection(["foo", "bar", "baz"])
        suite.assert(Memory.db.foo)
        suite.assert(Memory.db.foo.bar)
        suite.assert(Memory.db.foo.bar.baz)
        suite.assertFalse(Memory.db.bar, "Memory.db.bar")
        suite.assertFalse(Memory.db.baz, "Memory.db.baz")
        suite.assert(typeof Memory.db.foo == 'object')
        suite.assert(typeof Memory.db.foo.bar == 'object')
        suite.assert(typeof Memory.db.foo.bar.baz == 'object')

        suite.newSet("getSection")
        Memory.db.foo.bar.baz.quux = 3
        suite.assertEqual(@getSection(["foo", "bar", "baz", "quux"]), 3)

        suite.newSet("createTable")
        @createTable("i.like.fruit")
        suite.assert(Memory.db.i.like.fruit)
        suite.assert(_.isArray(Memory.db.i.like.fruit.list.data)) # in javascript lists == objects?
        suite.assertEqual(Memory.db.i.like.fruit.list.data.length, 0)

        suite.newSet("insert")
        @insert("i.like.fruit", {'cookies':3})
        suite.assertEqual(Memory.db.i.like.fruit.list.data.length, 1)
        suite.assertEqual(Memory.db.i.like.fruit.list.data[0].cookies, 3)
        suite.assertEqual(Memory.db.i.like.fruit.list.data[0].id, 1)
        @insert("i.like.fruit", {'cookies':4})
        suite.assertEqual(Memory.db.i.like.fruit.list.data.length, 2)
        suite.assertEqual(Memory.db.i.like.fruit.list.data[1].cookies, 4)
        suite.assertEqual(Memory.db.i.like.fruit.list.data[1].id, 2)

        suite.newSet("query")
        records = @query("i.like.fruit", (x) -> x.cookies == 3)
        suite.assert(_.isArray(records))
        suite.assertEqual(records.length, 1)
        suite.assertEqual(records[0].cookies, 3)

        suite.newSet("retrieve")
        suite.assertEqual(@retrieve("i.like.fruit", 1).cookies, 3)

        suite.newSet("query no filters")
        records = @query("i.like.fruit")
        suite.assert(_.isArray(records))
        suite.assertEqual(records.length, 2)
        suite.assertEqual(records[0].cookies, 3)
        suite.assertEqual(records[1].cookies, 4)

        suite.finish()
        delete Memory.db.i
        delete Memory.db.foo


module.exports = Database