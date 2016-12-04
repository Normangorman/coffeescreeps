Log = require("./log.coffee")
log = new Log("structs", "#FFFFFF")
DijkstraGraph = require("node-dijkstra")
Util = require("./util.coffee")
Test = require("./test.coffee")
LoadableObject = require("./loadableobject.coffee")

class OrderedList extends LoadableObject
    @create: (keyName, order=1) ->
        keyName: keyName
        data: []
        order: order

    _itemToKeyFunc: ->
        keyName = @meta.keyName
        (i) -> i[keyName]

    insert: (item) ->
        search = Util.binaryFind(@meta.data, item, @_itemToKeyFunc(), @meta.order)
        #log.debug("inserting ", item, "search", search)
        @meta.data.splice(search.index, 0, item)

    items: -> @meta.data

    delete: (item) ->
        search = Util.binaryFind(@meta.data, item, @_itemToKeyFunc(), @meta.order)
        if search.found
            @deleteByIndex search.index
        else
             false

    deleteByIndex: (i) ->
        if @meta.data.length > i
            @meta.data.splice(i, 1)
            true
        else
            false

    lookup: (item) ->
        search = Util.binaryFind(@meta.data, item, @_itemToKeyFunc(), @meta.order)
        #log.debug("looking up ", item, "search", search)
        if search.found
            @meta.data[search.index]
        else
            null

    contains: (item) ->
        Boolean @lookup(item)

    @test: ->
        list = OrderedList.load(OrderedList.create("key"))
        suite = new Test.TestSuite("OrderedList", true)
        suite.newSet("OrderedList")

        testItem = {key: 3, foo: 'bar'}
        testItem2 = {key: 2, foo: 'bing'}
        list.insert(testItem)
        suite.assert(list.lookup(testItem), "list.lookup(testItem)")
        suite.assert(list.contains(testItem), "list.contains(testItem)")
        list.delete(testItem, "list.delete(testItem)")
        suite.assertFalse(list.contains(testItem), "not list.contains(testItem)")

        list.insert(testItem)
        list.insert(testItem2)

        i = 0
        for item in list.items()
            if i==0 then suite.assertEqual(item.foo, 'bing')
            else if i==1 then suite.assertEqual(item.foo, 'bar')
            i++
        suite.finish()

class PriorityQueueElement
    constructor: (@item, @priority) ->

class PriorityQueue
    constructor: (@useItemPriorityAttribute=true) ->
        # If useItemPriorityAttribute is true then expect every item to have a .priority attribute
        @data = []

    insert: (item, priority) ->
        if @useItemPriorityAttribute
            priority = item.priority
        else if not priority then log.error("insert: no priority given")

        # Note this line should work for both cases - either using priorities within object
        # or using PriorityQueueElements
        index = Util.binaryFind(@data, {priority: priority}, (rec) -> rec.priority)

        if @useItemPriorityAttribute
            toInsert = item
        else
            toInsert = PriorityQueueElement(item, priority)

        @data.splice(index, 0, toInsert)

    items: -> @data

    delete: (index) ->
        return @data.splice(index, 1)

    contains: (itemToFind, equalityFunc) ->
        if not equalityFunc then equalityFunc = (a,b) -> a == b

        for element in @data
            if @useItemPriorityAttribute
                item = element
            else
                item = element.item

            if equalityFunc(item, itemToFind)
                return true
        false

    count: -> @data.length

    @test: ->
        suite = new Test.TestSuite("structs.PriorityQueue", true)
        q = new PriorityQueue(true)

        suite.newSet("insert")
        q.insert({key: 1, 'quux', priority: 1})
        q.insert({key: 2, 'bar', baz: 3, priority: 5})
        suite.assert(q.contains({key: 1}), "q.contains({key: 1})", (a,b) -> a.key == b.key)
        suite.assert(q.contains({key: 2}), "q.contains({key: 2})", (a,b) -> a.key == b.key)

        suite.newSet("iterate")
        i = 0
        for item in q.items()
            log.debug("test")
            if i==0 then suite.assert(item.key == 2)
            else if i==1 then suite.assert(item.key == 1)
            i++

        suite.finish()

module.exports.DijkstraGraph = DijkstraGraph
module.exports.OrderedList = OrderedList
module.exports.PriorityQueue = PriorityQueue
module.exports.test = ->
    OrderedList.test()
    PriorityQueue.test()
