StatsModule = require('./modules/stats.coffee')
TeamsModule = require('./modules/teams.coffee')
RolesModule = require('./modules/roles.coffee')
PathWebModule = require('./modules/pathweb.coffee')
DatabaseModule = require('./modules/database.coffee')
Util = require('./util.coffee')
Prototypes = require('./prototypes.coffee')
Structs = require('./structs.coffee')
Log = require('./log.coffee')
log = new Log("main", "#FFFFFF")

for module in [DatabaseModule, StatsModule, PathWebModule, TeamsModule, RolesModule]
    module.onTick()

# TODO: retest prototypes
#Structs.test()
#Util.test()
#Prototypes.test()
PathWebModule.test()
#DatabaseModule.test()
