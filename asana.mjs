#!/usr/bin/env node
/* jshint esversion: 11,-W097, -W040, node: true, expr: true, undef: true */
import { get, request } from "https";
import { clearLine, moveCursor } from "readline";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import readline from "readline";
import { execFileSync } from "child_process";

const version= "2022-03-03";
const alias_join= "<%space%>";
const { script_name, path, Authorization, argvs }= scriptsInputs();
const { isTTY }= process.stdout;
const isTCS= /-256(color)?$/i.test(process.env.TERM);
const user_= prepareUser();
const opt_fields_tasks_mem= [ "memberships.project.name", "memberships.section.name" ];
const opt_fields_tasks= [ "name", ...opt_fields_tasks_mem, "modified_at", "num_subtasks", "custom_fields", "permalink_url", "tags.name", "tags.gid" ];
const help_choose= "using numbers separated by space (0 1) or range (0-3) or all (*)";
(async function main_(cmd= "--help"){
    if("--help"===cmd) return helpMain();
    if("--version"===cmd) return console.log(version);
    if("--config-path"===cmd) return console.log(path.config);
    
    if("completion_bash"===cmd) return completion_bash();
    if("auth"===cmd) return auth_();
    if("alias"===cmd) return alias();
    if("abbreviate"===cmd) return abbreviate(argvs);
    if("api"===cmd) return api_();

    if("marks"===cmd) return marks_(argvs);
    
    if("list"!==cmd) return Promise.reject(`Unknown command '${cmd}'`);
    const type= argvs.shift() ?? "tasks-todos";
    if("--help"===type) return helpList();

    if("tags"===type) return pinTags_();
    if("custom_fields"===type) return pinCustomFields_();
    if("sections"===type) return pinSections_();

    if("tasks-todos"===type) return todo_();
    if("tasks-favorites"===type) return list_(true);
    if("tasks-all"===type) return list_(false);
})(argvs.shift())
.then((v= 0)=> process.exit(v))
.catch(pipe(console.error, process.exit.bind(process, 1)));

function completion_bash(){
    //#region …
    const cmd= argvs.shift();
    if("--help"===cmd){
        console.log(`Add 'eval "$(${script_name} completion_bash)"' to your '.bashrc' file.`);
        process.exit(0);
    }
    if("--complete"!==cmd){
        console.log("__asana_cli_opts()\n{\n");
        console.log(` COMPREPLY=( $(${script_name} completion_bash --complete "\${#COMP_WORDS[@]}" "\${COMP_WORDS[COMP_CWORD]}" "\${COMP_WORDS[COMP_CWORD-1]}" "\${COMP_WORDS[1]}") )`);
        console.log("return 0\n}");
        console.log(`complete -o filenames -F __asana_cli_opts ${script_name}`);
        process.exit(0);
    }
    const [ level, now, prev, first ]= argvs;
    const options= [ "list", "api", "alias", "auth", "marks", "--help", "--version", "--config-path" ];
    const matches= arr=> arr.filter(item=> item.indexOf(now)===0).join(" ");
    if(level==2){
        console.log(matches(Object.keys(configRead().aliases))+" "+matches(options));
        process.exit(0);
    }
    if("marks"===prev){
        console.log(matches(Object.keys(configRead().marks)));
        process.exit(0);
    }
    if("list"===first){
        if(level==3)
            console.log(matches([ "tasks-todos", "tasks-favorites", "tasks-all", "tags", "custom_fields", "sections" ]));
        else
            console.log(matches([ "--help", "list" ]));
        process.exit(0);
    }
    if("abbreviate"===first){
        if(level==3)
            console.log(matches([ "custom_fields", "tags", "sections" ]));
        else
            console.log(matches([ "add", "remove", "list" ]));
        process.exit(0);
    }
    if(first==="alias" && level===3){
        console.log(matches([ "add", "remove", "list" ]));
        process.exit(0);
    }
    console.log(matches(["--help"]));
    process.exit(0);
    //#endregion …
}
function helpList(){
    //#region …
    const n= f(script_name, "magenta");
    return console.log(`
    Primarly interface to pin/mark tags, custom_fields, section and tasks.
    Also possible use just for prints list of mentioned (e. g. tags, tasks).
    
    USAGE
        ${n} ${f("list", "blue")} ${f("[tags|custom_fields|sections]", "cyan")} ${f("…", "red")}
            ${n} list tags [list|--help]
            ${n} list custom_fields [num_workspace [json]] [--help]
            ${n} list sections [num_workspace [json]] [--help]
        ${n} ${f("list", "blue")} ${f("[tasks-todos|tasks-favorites|tasks-all]", "cyan")} ${f("…", "red")}
`);
    //#endregion …
}
function abbreviate(argvs){
    //#region …
    const [ type= "custom_fields", cmd= "list", name, value= "" ]= argvs;
    const key= "abbrev"+( type==="custom_fields" ? "C" : (type==="tags" ? "T" : "S") );
    const config= configRead();
    const abbrevs= config[key];
    if("list"===cmd){
        const list= Object.entries(abbrevs);
        const pad= Math.max(...list.map(([{ length }])=> length));
        console.log("NAME".padEnd(pad)+"\tVALUE");
        list.map(arr=> arr.map((n,i)=> !i ? n.padEnd(pad) : n).join("\t")).forEach(v=> console.log(v));
        return 0;
    }
    if("remove"===cmd){
        Reflect.deleteProperty(abbrevs, name);
        config[key]= abbrevs;
        configWrite(config);
        return 0;
    }
    if(!value){
        console.error("Second argument missing for abbreviate '"+name+"'");
        return 1;
    }
    config[key][name]= type==="custom_fields" ? '{"'+value.split("=").join('":"')+'"}' : value;
    configWrite(config);
    return 0;
    //#endregion …
}
function alias(){
    //#region …
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Manage aliases for "+script_name,
            "",
            "USAGE",
            script_name+" list",
            script_name+" add _name …",
            script_name+" remove _name",
            "",
            "HELP",
            "  -   'list': pritns available aliases",
            "  -    'add': register new alias with name '_name' and value is",
            "              combinations of cli’s subcommands (e. g. 'alias list',",
            "              'list tags', …)",
            "  - 'remove': unregister alias with name '_name'",
            "",
            "USE ALIAS",
            "  All registered aliases are available as main command:",
            `    ${script_name} _example`,
            "",
            "EXAMPLES",
            `   ${script_name} api custom_fields/798840962403818?opt_fields=name,enum_options.name`,
            `   ${script_name} alias add _cf_rogress api custom_fields/798840962403818?opt_fields=name,enum_options.name`,
            `   ${script_name} _cf_rogress`,
            "",
            `   ${script_name} list tasks-todos 0 0 list`,
            `   ${script_name} alias add _todo_last_modified list tasks-todos 0 0 list`,
            `   ${script_name} _todo_last_modified`,
            `   ${script_name} alias remove _todo_last_modified`,
            "",
            "PLANNED",
            "  In future, there will be probably option to use placeholder (? '::1::', '::2::', …).",
            "  So, previous example could be more general, such as:",
            `    ${script_name} alias add _todo_last_modified list tasks-todos 0 ::1:: list`,
            `    ${script_name} _todo_last_modified 0`,
        ].map(l=> "    "+l).join("\n")); //#endregion help

    const prefix= "_";
    const cmd= argvs.shift() ?? "list";
    let name= argvs.shift();
    const config= configRead();
    if("list"===cmd){
        const list= Object.entries(config.aliases);
        const pad= Math.max(...list.map(([{ length }])=> length));
        console.log("NAME".padEnd(pad)+"\tVALUE");
        list.map(arr=> arr.map((n,i)=> !i ? n.padEnd(pad) : n).join("\t")).forEach(v=> console.log(v));
        return 0;
    }
    if("remove"===cmd){
        Reflect.deleteProperty(config.aliases, name);
        configWrite(config);
        return 0;
    }
    const alias= argvs.join(alias_join);
    if(!alias){
        console.error("Command missing for alias '"+name+"'");
        return 1;
    }
    if(name[0]!==prefix){
        console.log("For aliases prefix '_' is needed to prevent colision with possible future features");
        name= prefix+name;
        console.log(`So new name is: ${name}`);
    }
    config.aliases[name]= alias;
    configWrite(config);
    return 0;
    //#endregion …
}
async function api_(){
    //#region …
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Make Asana REST API easily (auto autorization, …) just via "+script_name,
            "",
            "USAGE",
            `  ${script_name} api REST_API`,
            "",
            "HELP",
            "  For REST_API options see: https://developers.asana.com/docs/asana.",
            "  For now only GET options are available.",
            "",
            "EXAMPLE",
            `  ${script_name} api custom_fields/798840962403818?opt_fields=name,enum_options.name`,
            "",
            "PLANNED",
            "  In future, there will be probably option '--method' (POST, PUT, …, GET as default) and '--send-json'."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    
    const request= argvs.shift() ?? "--help";
    const out= await get_(request);
    console.log(isTTY ? out : JSON.stringify(out));
    return 0;
    //#endregion …
}
async function pinTags_(){
    //#region …
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Interactive interface to pin tags to be able to work with marked tasks.",
            "",
            "USAGE",
            `  ${script_name} list tags`,
            `  ${script_name} list tags list`,
            `  ${script_name} list tags [list] --help`,
            "",
            "BASIC (interactive interface)",
            "  You see list in form 'number: tag_name' (or '*number: tag_name') separated by ','. And section '*** Commands **'",
            "  with options [q]uit, [f]ilter, [t]oggle pin (*). Below, there is promnt 'What now',",
            "  so you can enter q/f/t to choose operation. In next step you can filter list by (partialy) entered text,",
            "  or mark by "+help_choose,
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "LIST",
            "  Prints tags list in form 'gid\\tname' separated by new lines."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    const spinEnd= spiner();
    const tags= await get_("tags", { qs: { opt_fields: [ "followers", "name" ] } });
    const cmd= argvs.shift() ?? "shell";
    if("list"===cmd) return printList(tags);
    return await shell_(tags);
    
    function filter(name_filter= ""){
        if(!name_filter) return tags;
        return tags.filter(({ name })=> name.indexOf(name_filter)!==-1);
    }
    async function shell_(tags){
        const rl= createInterface();
        const pinned= Object.keys(configRead().abbrevT);
        spinEnd();
        print();
        while(true){
            const cmd= await questionCmd_(rl, [ "[q]uit", "[f]ilter", "[t]oggle pin (*)" ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "f": tags= filter(await question_(rl, "filter by name")); print(); continue;
                    case "t": (await questionChoose_(rl, Object.keys(tags))).map(toggle); print(); continue;
                    default: throw new Error(`Unknown '${cmd}'`);
                }
            } catch(e){
                console.error(e.message+" …exit with 'q'"); continue;
            }
        }
        function toggle(num){
            const { gid, name }= tags[num];
            const index= pinned.indexOf(name);
            const operation= index===-1 ? "add" : "remove";
            const error= abbreviate([ "tags", operation, name, gid ]);
            if(error) throw new Error("Tag operation failed!");
            if(operation==="add") pinned.unshift(name);
            else pinned.splice(index, 1);
            return console.log(`'${operation[0].toUpperCase()+operation.slice(1)} ${name}' successfully done.`);
        }
        function print(){ return console.log("\n"+tags.map(({name}, num)=> `${pinned.indexOf(name)===-1?"":"*"}${num}: ${name}`).join(",\t")); }
    }
    function printList(tags){
        spinEnd();
        const col= t=> t.padEnd(tags[tags.length - 1].gid.length);
        if(isTTY)
            console.log(col("GID")+"\tNAME");
        tags.forEach(({ gid, name })=> console.log(`${col(gid)}\t${name}`));
    }
    //#endregion …
}
async function pinSections_(){
    //#region …
    const spinEnd= spiner();
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Interactive interface to pin sections (combinations of project and section)",
            "to be able to work with marked tasks. Projects (and sections) are grouped by workspaces.",
            "So with calling without any other arguments you see list of workspaces in form",
            "'NUM\\tNAME\\tGID'. Number in NUM column use as 'num_workspace' (typically you want 0).",
            "",
            `There are currently only ${f("favorites project", "yellow")} included (see https://asana.com/guide/help/fundamentals/homepage#gl-favorites)!`,
            "",
            "USAGE",
            `  ${script_name} list sections [--help]`,
            `  ${script_name} list sections num_workspace [json] [--help]`,
            "",
            "BASIC (interactive interface)",
            "  You see list in form 'number: tag_name' (or '*number: tag_name') separated by ','. And section '*** Commands **'",
            "  with options [q]uit, [f]ilter, [t]oggle pin (*). Below, there is promnt 'What now',",
            "  so you can enter q/f/t to choose operation. In next step you can filter list by (partialy) entered text,",
            "  or mark by "+help_choose,
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "JSON",
            "  Prints all sections list as json."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    const num_workspace= argvs.shift() ?? "list";
    exitHelp(num_workspace);
    const list_workspaces= await user_().then(({ workspaces })=> workspaces);
    if("list"===num_workspace)
        return printList("Workspaces", list_workspaces);
    const data_workspace= list_workspaces[num_workspace];
    
    const projects= await get_("users/me/favorites", { qs: { workspace: data_workspace.gid, resource_type: "project", opt_fields: [ "name", "gid" ] } });
    const list= [];
    for(const project of Object.values(projects)){
        const sections= await get_(`projects/${project.gid}/sections`);
        const pv= { project: project.gid };
        if(!sections.length){
            list.push({ name: project.name, value: JSON.stringify(pv) });
            continue;
        }
        for(const section of Object.values(sections))
            list.push({ name: project.name+" → "+section.name, value: JSON.stringify(Object.assign({}, pv, { section: section.gid })) });
    }
    if("json"===(argvs.shift() ?? "shell"))
        return console.log(isTTY ? list.map(o=> (o.value= JSON.parse(o.value), o)) : JSON.stringify(list.map(o=> (o.value= JSON.parse(o.value), o))));
    return await shell_(list);
    
    function filter(name_filter= ""){
        if(!name_filter) return list;
        return Object.values(list).filter(({ name })=> name.indexOf(name_filter)!==-1);
    }
    async function shell_(list_cf){
        const rl= createInterface();
        const pinned= Object.keys(configRead().abbrevS);
        spinEnd();
        print();
        while(true){
            const cmd= await questionCmd_(rl, [ "[q]uit", "[f]ilter", "[t]oggle pin (*)" ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "f": list_cf= filter(await question_(rl, "filter by name")); print(); continue;
                    case "t": (await questionChoose_(rl, Object.keys(list_cf))).map(toggle); print(); continue;
                    default: throw new Error(`Unknown '${cmd}'`);
                }
            } catch(e){
                console.error(e.message+" …exit with 'q'"); continue;
            }
        }
        function toggle(num){
            const { value, name }= list_cf[num];
            const index= pinned.indexOf(name);
            const operation= index===-1 ? "add" : "remove";
            const error= abbreviate([ "sections", operation, name, value ]);
            if(error) throw new Error("Tag operation failed!");
            if(operation==="add") pinned.unshift(name);
            else pinned.splice(index, 1);
            return console.log(`'${operation[0].toUpperCase()+operation.slice(1)} ${name}' successfully done.`);
        }
        function print(){ return console.log("\n"+list_cf.map(({name}, num)=> `\t${pinned.indexOf(name)===-1?"":"*"}${num}: ${name}`).join("\n")); }
    }
    
    function printList(title, list){
        spinEnd();
        if(isTTY)
            console.log(`${title}\nNUM\tNAME\tGID`);
        console.log(list.map(({ name, gid }, num)=> `${num}\t${name}\t${gid}`).join("\n"));
    }
    function exitHelp(num){
        if("--help"!==num) return false;
        spinEnd();
        console.log("HELP");
        process.exit(0);
    }
    //#endregion …
}
async function pinCustomFields_(){
    //#region …
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Interactive interface to pin custom_fields to be able to work with marked tasks.",
            "Custom fileds are grouped by workspaces. So with calling without any other arguments",
            "you see list of workspaces in form 'NUM\\tNAME\\tGID'. Number in NUM column use as ",
            "'num_workspace' (typically you want 0).",
            "",
            "USAGE",
            `  ${script_name} list custom_fields [--help]`,
            `  ${script_name} list custom_fields num_workspace [json] [--help]`,
            "",
            "BASIC (interactive interface)",
            "  You see list in form 'number: tag_name' (or '*number: tag_name') separated by ','. And section '*** Commands **'",
            "  with options [q]uit, [f]ilter, [t]oggle pin (*). Below, there is promnt 'What now',",
            "  so you can enter q/f/t to choose operation. In next step you can filter list by (partialy) entered text,",
            "  or mark by "+help_choose,
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "JSON",
            "  Prints all custom_fields list as json."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    const spinEnd= spiner();
    const num_workspace= argvs.shift() ?? "list";
    const list_workspaces= await user_().then(({ workspaces })=> workspaces);
    if("list"===num_workspace)
        return printList("Workspaces", list_workspaces);
    const data_workspace= list_workspaces[num_workspace];
    
    const list_pre= await get_(`workspaces/${data_workspace.gid}/custom_fields`, { qs: { opt_fields: [ "name", "gid", "enum_options.gid", "enum_options.name", "type" ] } });
    if("json"===(argvs.shift() ?? "shell"))
        return console.log(isTTY ? list_pre : JSON.stringify(list_pre));
    const list= list_pre.flatMap(function({ name: name_main, gid: gid_main, enum_options, type }){
        if(!enum_options) return [ { name: name_main+"_"+type, value: gid_main+"=<%1%>" } ];
        return enum_options.map(({ name, gid })=> ({ name: name_main+"→"+name, value: gid_main+"="+gid }));
    });
    return await shell_(list);
    
    function filter(name_filter= ""){
        if(!name_filter) return list;
        return Object.values(list).filter(({ name })=> name.indexOf(name_filter)!==-1);
    }
    async function shell_(list_cf){
        const rl= createInterface();
        const pinned= Object.keys(configRead().abbrevC);
        spinEnd();
        print();
        while(true){
            const cmd= await questionCmd_(rl, [ "[q]uit", "[f]ilter", "[t]oggle pin (*)" ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "f": list_cf= filter(await question_(rl, "filter by name")); print(); continue;
                    case "t": (await questionChoose_(rl, Object.keys(list_cf))).map(toggle); print(); continue;
                    default: throw new Error(`Unknown '${cmd}'`);
                }
            } catch(e){
                console.error(e.message+" …exit with 'q'"); continue;
            }
        }
        function toggle(num){
            const { value, name }= list_cf[num];
            const index= pinned.indexOf(name);
            const operation= index===-1 ? "add" : "remove";
            const error= abbreviate([ "custom_fields", operation, name, value ]);
            if(error) throw new Error("Tag operation failed!");
            if(operation==="add") pinned.unshift(name);
            else pinned.splice(index, 1);
            return console.log(`'${operation[0].toUpperCase()+operation.slice(1)} ${name}' successfully done.`);
        }
        function print(){ return console.log("\n"+list_cf.map(({name}, num)=> `\t${pinned.indexOf(name)===-1?"":"*"}${num}: ${name}`).join("\n")); }
    }
    
    function printList(title, list){
        spinEnd();
        if(isTTY)
            console.log(`${title}\nNUM\tNAME\tGID`);
        console.log(list.map(({ name, gid }, num)=> `${num}\t${name}\t${gid}`).join("\n"));
    }
    //#endregion …
}
function todo_(){
    // #region …
    if(argvs.some(n=> n==="--help"))
        return console.log([ //#region help
            "Interactive interface to mark task(s) – this view corresponds to My Tasks (https://asana.com/guide/help/fundamentals/my-tasks).",
            "Tasks are grouped per section and project. They are oredered by last modification (so by '0 0' you find last modified task(s)).",
            "",
            "USAGE",
            `  ${script_name} list tasks-todos [--help]`,
            `  ${script_name} list tasks-todos num_project num_section [json|list] [--help]`,
            `  ${script_name} list tasks-todos 0 0`,
            "",
            "BASIC (interactive interface)",
            "  You will be asked to fill mark name and description.",
            "  Then you see list in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME' and section '*** Commands **'",
            "  with options [q]uit, …. Below, there is promnt 'What now',",
            "  so you can enter q/… to choose operation. In next step you can be asked to",
            "  choose tasks ("+help_choose+")",
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "LIST",
            "  Prints tasks in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME'.",
            "",
            "JSON",
            "  Prints all sections list as json."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    const spinEnd= spiner();
    return user_()
    .then(function({ gid: assignee, workspaces: [ { gid: workspace } ] }){
        const completed_since= "now";
        return get_("tasks", { cache: "max-age=15", qs: { assignee, workspace, completed_since, opt_fields: opt_fields_tasks } });
    })
    .then(async function(data){
        const no_p= { gid: 'no', name: 'No project' }, no_s= { gid: 'no', name: 'No section' };
        const grouped= data.sort(sortByModified).reduce(function(out, data){
            (data.memberships.length ? data.memberships : [ {} ]).forEach(function({ project= no_p, section= no_s }){
                const p= project.gid;
                if(!out[p])
                    out[p]=Object.assign({}, project, { sections: {} });
                const s= section.gid;
                if(!out[p].sections[s])
                    out[p].sections[s]= Object.assign({}, section, { list: [] });
                out[p].sections[s].list.push(data);
            });
            return out;
        }, {});
        
        const num_project= argvs.shift() ?? "list";
        const list_projects= Object.entries(grouped);
        if("list"===num_project)
            return printList(`Projects containing tasks to do.`, list_projects);
        const data_project= list_projects[num_project][1];
        
        const num_section= argvs.shift() ?? "list";
        const list_sections= Object.entries(data_project.sections);
        if("list"===num_section)
            return printList(`Task todo in project '${data_project.name}'`, list_sections);
        const data_section= list_sections[num_section][1];
        
        const num_task= argvs.shift() ?? "mark";
        const list_tasks= Object.entries(data_section.list);
        return await tasks_(list_tasks, num_task, data_project, data_section, spinEnd);
        
        function printList(title, list){
            spinEnd();
            if(isTTY)
                console.log(`${title}\nNUM\tNAME\tGID`);
            console.log(list.map(([ , { name, gid } ], num)=> `${num}\t${name}\t${gid}`).join("\n"));
        }
        function sortByModified({ modified_at: a }, { modified_at: b }){
            const [ aa, bb]= [ a, b ].map(v=> Number(v.replace(/[^0-9]/g, '')));
            return bb-aa;
        }
    });
    // #endregion …
}
async function list_(is_favorites){
    // #region …
    if(argvs.some(n=> n==="--help")){
        const cmd= "tasks-"+(is_favorites ? "favorites" : "all");
        return console.log([ //#region help
            "Interactive interface to mark task(s) – this view corresponds to ",
            is_favorites ?
                "your favorited (https://asana.com/guide/help/fundamentals/homepage#gl-favorites)" :
                "all tasks in workspace",
            "Tasks are grouped per section, project and workspaces.",
            "",
            "USAGE",
            `  ${script_name} list ${cmd} [--help]`,
            `  ${script_name} list ${cmd} num_workspace num_project num_section [--help]`,
            `  ${script_name} list ${cmd} num_workspace num_project num_section [json|list|mark] [--help]`,
            `  ${script_name} list ${cmd} 0 0 0`,
            "",
            "BASIC (interactive interface)",
            "  The second usage example (or 3rd with 'mark' option).",
            "  You will be asked to fill mark name and description.",
            "  Then you see list in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME' and section '*** Commands **'",
            "  with options [q]uit, …. Below, there is promnt 'What now',",
            "  so you can enter q/… to choose operation. In next step you can be asked to",
            "  choose tasks ("+help_choose+")",
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "LIST",
            "  Prints tasks in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME'.",
            "",
            "JSON",
            "  Prints all sections list as json."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    }
    const spinEnd= spiner();
    const num_workspace= argvs.shift() ?? "list";
    const list_workspaces= await user_().then(({ workspaces })=> workspaces);
    if("list"===num_workspace)
        return printList("Workspaces", list_workspaces);
    const data_workspace= list_workspaces[num_workspace];

    const num_project= argvs.shift() ?? "list";
    const list_projects= await get_(is_favorites ? `users/me/favorites?workspace=${data_workspace.gid}&resource_type=project` : `workspaces/${data_workspace.gid}/projects`);
    if("list"===num_project)
        return printList(`Projects in '${data_workspace.name}'`, list_projects);
    const data_project= list_projects[num_project];

    const num_section= argvs.shift() ?? "list";
    const list_sections= await get_(`projects/${data_project.gid}/sections`);
    if("list"===num_section)
        return printList(`Sections in '${data_workspace.name}' → '${data_project.name}'`, list_sections);
    const data_section= list_sections[num_section];

    const num_task= argvs.shift() ?? "mark";
    const list_tasks= Object.entries(await get_(`sections/${data_section.gid}/tasks`, { cache: "no-cache", qs: { opt_fields: opt_fields_tasks } }));
    return await tasks_(list_tasks, num_task, data_project, data_section, spinEnd);

    function printList(title, list){
        spinEnd();
        if(isTTY)
            console.log(`${title}\nNUM\tNAME\tGID`);
        console.log(list.map(({ name, gid }, num)=> `${num}\t${name}\t${gid}`).join("\n"));
    }
    // #endregion …
}
async function marks_(argvs_local){
    //#region …
    const spinEnd= spiner();
    argvs_local= [...argvs_local];
    if(argvs_local.some(n=> n==="--help"))
        return console.log([ //#region help
            "Interactive interface to work with marked tasks.",
            "",
            "USAGE",
            `  ${script_name} marks mark_name [--help]`,
            "",
            "BASIC (interactive interface)",
            "  You will be asked to fill mark name and description.",
            "  Then you see list in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME' and section '*** Commands **'",
            "  with options [q]uit, …. Below, there is promnt 'What now',",
            "  so you can enter q/… to choose operation. In next step you can be asked to",
            "  choose tasks ("+help_choose+")",
            "  The 'q' interrups interactive mode (also you can use CTRL+C).",
            "",
            "LIST",
            "  Prints tasks in form 'NUM\\tGID\\tSUBTASKS\\tUPDATED\\tNAME'.",
            "",
            "JSON",
            "  Prints all sections list as json."
        ].map(l=> "    "+l).join("\n")); //#endregion help
    const data_marks= configRead().marks;
    const mark= argvs_local.shift() ?? "list";
    if("list"===mark){
        spinEnd();
        if(isTTY)
            console.log("NAME\tDESCRIPTION\tDATE");
        Object.entries(data_marks).forEach(([ name, { description= "—", date= "—" } ])=> console.log(`${name}\t${description}\t${date}`));
        return 0;
    }
    let list_tasks= await Promise.all(data_marks[mark].tasks.map(gid=> get_(`tasks/${gid}`, { cache: "no-cache", gs: { opt_fields: opt_fields_tasks } })));
    spinEnd();
    const data_only= argvs_local.shift() ?? "";
    if("json"===data_only)
        return console.log(isTTY ? list_tasks : JSON.stringify(list_tasks));
    if("list"===data_only)
        return print(list_tasks);
    await shell_(Object.keys(list_tasks), num_task=> taskView_(list_tasks[num_task]));

    async function shellMark_(rl, options, task_, open_){
        const marked= new Set(data_marks[mark].tasks);
        let { description, date }= data_marks[mark];
        printMarkInfo({ description, date });
        while(true){
            print(list_tasks, marked);
            const cmd= await questionCmd_(rl, [ "[q]uit", "[r]eload", "[v]iev", "[w]eb", "[m]ark toggle", "[e]dit info", "[s]ave", "[D]elete" ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "r": rl.close(); return marks_(argvs);
                    case "e": await editInfo_(); continue;
                    case "m": await Promise.all((await questionChoose_(rl, options)).map(toggleMark)); continue;
                    case "v": await Promise.all((await questionChoose_(rl, options)).map(task_)); continue;
                    case "w": await questionChoose_(rl, options).then(openTaskWeb_); continue;
                    case "D": save(true); return 0;
                    case "s": save(); return marks_(argvs);
                    default: throw new Error(`Unknown '${cmd}'`);
                }
            } catch(e){
                console.error(e.message+" …exit with 'q'"); continue;
            }
        }
        function save(remove){
            const c= configRead();
            if(remove) Reflect.deleteProperty(c.marks, mark);
            else Reflect.set(c.marks, mark, { description, date, tasks: Array.from(marked) });
            configWrite(c);
            rl.close();
        }
        function toggleMark(id_mark){
            const gid= list_tasks[id_mark].gid;
            if(!gid) return;
            if(marked.has(gid)) return marked.delete(gid);
            return marked.add(gid);
        }
        async function editInfo_(){
            description= await question_(rl, "Mark description", description);
            date= await question_(rl, "Mark date", date);
            printMarkInfo({ description, date });
        }
        function openTaskWeb_(tasks){ return Promise.all(tasks.map(n=> open_(list_tasks[n].permalink_url+"/f"))); }
    }
    async function shell_(options, task_){
        const rl= createInterface();
        const open_= getOpen();
        printMarkInfo();
        while(true){
            print(list_tasks);
            const cmd= await questionCmd_(rl, [ "[q]uit", "[r]eload", "[v]iev", "[w]eb", "[c]ustom [f]ields", "[t]ag toggle", "[s]ection (project)", "[m]anage mark" ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "r": rl.close(); return marks_(argvs);
                    case "m": return shellMark_(rl, options, task_, open_);
                    case "v": await Promise.all((await questionChoose_(rl, options)).map(task_)); continue;
                    case "cf": await updateCF_(await questionChoose_(rl, options), rl); continue;
                    case "t": await updateTag_(await questionChoose_(rl, options), rl); continue;
                    case "s": await updateSection_(await questionChoose_(rl, options), rl); continue;
                    case "w": await questionChoose_(rl, options).then(openTaskWeb_); continue;
                    default: throw new Error(`Unknown '${cmd}'`);
                }
            } catch(e){
                console.error(e.message+" …exit with 'q'"); continue;
            }
        }
        function openTaskWeb_(tasks){ return Promise.all(tasks.map(n=> open_(list_tasks[n].permalink_url+"/f"))); }
    }
    function printMarkInfo({ description, date }= data_marks[mark]){ console.log("Description: "+description+"\nDate: "+date); }
    async function updateSection_(tasks, rl){
        //#region …
        const abbrevS= configRead().abbrevS;
        const abbrevS_keys= Object.keys(abbrevS);
        console.log("sections: \n  "+abbrevS_keys.map((v,n)=> n+": "+v).join("\n  "));
        const abb= await question_(rl, "section num");
        if(!abb) return 0;
        const section= configRead().abbrevS[abbrevS_keys[abb]];
        if(!section){ console.log("Unknown section"); return 0; }
        const data= JSON.parse(section);
        
        return await Promise.all(tasks.map(async function(num){
            const data_task= list_tasks[num];
            return putPost_(`tasks/${data_task.gid}/addProject`, { qs: { data }, method: "POST" })
            .then(()=> get_(`tasks/${data_task.gid}`, { qs: { opt_fields: opt_fields_tasks_mem } }))
            .then(m=> list_tasks[num].memberships= m.memberships);
        })).catch(console.error);
        //#endregion …
    }
    async function updateTag_(tasks, rl){
        //#region …
        const abbrevT= configRead().abbrevT;
        const abbrevT_keys= Object.keys(abbrevT);
        console.log("tags: \n  "+abbrevT_keys.map((v,n)=> n+": "+v).join("\n  "));
        const abb= await question_(rl, "tag num");
        if(!abb) return 0;
        const tag= configRead().abbrevT[abbrevT_keys[abb]];
        if(!tag){ console.log("Unknown tag"); return 0; }
        
        return await Promise.all(tasks.map(async function(num){
            const data_task= list_tasks[num];
            const toggle= data_task.tags.find(t=> t.gid===tag) ? "removeTag" : "addTag";
            return putPost_(`tasks/${data_task.gid}/${toggle}`, { qs: { data: { tag } }, method: "POST" })
            .then(()=> get_(`tasks/${data_task.gid}/tags`, { qs: { opt_fields: [ "name", "gid" ] } }))
            .then(tags=> list_tasks[num].tags= tags);
        })).catch(console.error);
        //#endregion …
    }
    async function updateCF_(tasks, rl){
        //#region …
        const abbrevC= configRead().abbrevC;
        const abbrevC_keys= Object.keys(abbrevC);
        console.log("custom_fields abbreviates: \n  "+abbrevC_keys.map((v,n)=> n+": "+v).join("\n  "));
        const abb= await question_(rl, "custom_fields num");
        if(!abb) return 0;
        const json_data_pre= configRead().abbrevC[abbrevC_keys[abb]];
        if(!json_data_pre){ console.log("Unknown custom_fields"); return 0; }
        
        const json_data= json_data_pre.indexOf("<%1%>")===-1 ? json_data_pre : json_data_pre.replace(/<%1%>/g, await question_(rl, "argument needed"));
        return await Promise.all(tasks.map(async function(num){
            const data_task= list_tasks[num];
            return putPost_("tasks/"+data_task.gid, { qs: { data: { custom_fields: JSON.parse(json_data), opt_fields: opt_fields_tasks } } })
            .then(task=> list_tasks[num]= task);
        })).catch(console.error);
        //#endregion …
    }
    function print(list_tasks, marked){
        //#region …
        const showMark= !marked ? ()=> "" : gid=> marked.has(gid) ? "*" : "";
        if(isTTY){
            console.log(`NUM\t${"GID".padEnd(list_tasks[list_tasks.length - 1].gid.length)}\tSUBTASKS\tUPDATED\t\tNAME`);
        }
        const pad_subtasks= "subtasks".length;
        console.log(list_tasks
            .map(({ gid, modified_at, num_subtasks= 0, name }, num)=>
                `${showMark(gid)}${num}\t${gid}\t${String(num_subtasks).padEnd(pad_subtasks)}\t${modified_at.split('T')[0]}\t${name}`
            ).join("\n"));
        //#endregion …
    }
    //#endregion …
}
async function tasks_(list_tasks, num_task, data_project, data_section, spinEnd){
    //#region …
    spinEnd();
    if("json"===num_task)
        return console.log(isTTY ? list_tasks.map(v=> v[1]) : JSON.stringify(list_tasks.map(v=> v[1])));
    if("list"===num_task)
        return print();
    if("mark"===num_task&&isTTY)
        return await shell_(list_tasks.map(([num])=> num), num_task=> taskView_(list_tasks[num_task][1]));
    
    console.error(`Last argument can be json/list/mark (default) not '${num_task}'`);
    return 1;

    function print(marked= new Set()){
        //#region …
        if(isTTY){
            console.log(`Task todo in '${data_project.name}' → '${data_section.name}'`);
            console.log(`NUM\t${"GID".padEnd(list_tasks[list_tasks.length - 1][1].gid.length)}\tSUBTASKS\tUPDATED\t\tNAME`);
        }
        const pad_subtasks= "subtasks".length;
        return console.log(list_tasks
            .map(([ num, { gid, modified_at, num_subtasks, name } ])=>
                `${marked.has(gid)?"*":""}${num}\t${gid}\t${String(num_subtasks).padEnd(pad_subtasks)}\t${modified_at.split('T')[0]}\t${name}`
            ).join("\n"));
        //#endregion …
    }
    async function shell_(options, task_){
        const rl= createInterface();
        let name, description, date, marked= new Set();
        const marks= configRead().marks;
        print(marked);
        console.log("\n*** Create/Edit mark ***");
        currentMarks();
        await editInfo_();
        console.log(`\n*** Manage tasks for '${name}' ***`);
        print(marked);
        while(true){
            const cmd= await questionCmd_(rl, [
                "[q]uit", "[e]dit mark", "[c]urrent [m]arks",
                "[s]ave – append", "[s]ave – [r]eplace",
                "[v]iev task(s)", "[m]ark toggle", "[m]ark toggle ([s]ubtasks)"
            ]);
            if(!cmd) continue;
            try{
                switch(cmd){
                    case "q": rl.close(); return 0;
                    case "v": await Promise.all((await questionChoose_(rl, options)).map(task_)); continue;
                    case "e": await editInfo_(); continue;
                    case "cm": currentMarks(); continue;
                    case "m": markTasks(await questionChoose_(rl, options).then(mapTasks)); continue; 
                    case "ms": await questionChoose_(rl, options).then(markSubtasks_); continue;
                    case "sr":
                    case "s":
                        const c= configRead();
                        if(cmd==="s"&&Reflect.has(c.marks, name)) c.marks[name].tasks.forEach(pipe(marked.add.bind(marked)));
                        Reflect.set(c.marks, name, { description, date, tasks: Array.from(marked) });
                        configWrite(c);
                        rl.close();
                        return 0;
                }
            } catch(e){
                console.error(e, " …exit with 'q'"); continue;
            }
        }
        function currentMarks(){ console.log("  Current marks names: "+Object.keys(marks).join(", ")); }
        function mapTasks(ts){ return ts.map(t=> list_tasks[t][1].gid); }
        function markSubtasks_(nums_){
            return Promise.all(nums_.map(t=> get_(`tasks/${list_tasks[t][1].gid}/subtasks`, { cache: "no-cache" }))).then(ts=> ts.forEach(t=> markTasks(t.map(({gid})=> gid))));
        }
        function markTasks(tasks){
            tasks.forEach(t=> marked.has(t) ? marked.delete(t) : marked.add(t));
            print(marked);
        }
        async function editInfo_(){
            name= await question_(rl, "Mark name");
            let description_default, date_default;
            if(Reflect.has(marks, name)){
                console.log("Mark with this name already exists!");
                description_default= marks[name].description;
                date_default= marks[name].date;
            }
            description= await question_(rl, "Mark description", description_default);
            date= await question_(rl, "Mark date", date_default);
        }
    }
    //#endregion …
}
async function taskView_(data_task){
    //#region …
    const { name, memberships: memberships_pre, gid, custom_fields: custom_fields_pre, modified_at, num_subtasks, permalink_url, tags }= data_task;
    const memberships= memberships_pre.map(o=> Object.values(o).map(o=> o.name).join(" → "));
    const custom_fields= custom_fields_pre.filter(({ enabled })=> enabled).reduce((out, { name, display_value })=> Reflect.set(out, name, display_value) && out, {});
    const out= {
        name,
        memberships,
        gid,
        custom_fields,
        subtasks: (await get_(`tasks/${data_task.gid}/subtasks`, { cache: "no-cache" })).map(({ gid, name })=> ({ gid, name })),
        modified_at,
        tags: tags.map(({ name })=> name),
        permalink_url
    };
    if(isTTY) console.log(out);
    else console.log(JSON.stringify(out));
    //#endregion …
}
function prepareUser(){
    // #region …
    let user;
    return async function(){
        if(user) return user;
        user= await get_("users/me");
        return user;
    };
    // #endregion …
}
async function auth_(){
    //#region …
    if("--help"===(argvs.shift() ?? "--help"))
        return console.log(`Use '${script_name} auth' for\ninteractive connecting this cli with your Asana account.\nUses Personal Access Token (info there: https://developers.asana.com/docs/personal-access-token)`);

    console.log("Folows thhis steps:");
    console.log("1. Generates your Personal Access Token (PAT)");
    console.log("	- …there: https://app.asana.com/0/my-apps");
    console.log("	- info there: https://developers.asana.com/docs/personal-access-token");
    console.log("2. copy → paste token");
    const rl= readline.createInterface({ input: process.stdin, output: process.stdout });
    const bearer= (await question_(rl, "…there")).split().reverse().join();
    rl.close();
    if(!bearer){
        console.error("Input empty!");
        return 1;
    }
    writeFileSync(path.bearer, bearer, { encoding: "utf8" });
    console.log("Success");
    //#endregion …
}
function configWrite(config){ return writeFileSync(path.config, JSON.stringify(config, undefined, "  "), { encoding: "utf8" }); }
function configRead(path_manual){
    //#region …
    const path_config= path_manual || path.config;
    let config;
    try{
        config= readFileSync(path_config, { encoding: "utf8" });
    } catch {
        if(existsSync(path_config)){
            console.error(`Config file cannot be read (path: '${path_config}')`);
            process.exit(1);
        }
        config= '{"options":{},"aliases":{},"marks":{},"abbrevT":{},"abbrevC":{},"abbrevS":{}}';
    }
    return JSON.parse(config);
    //#endregion …
}
/** @returns {{ script_name: string, argvs: string[], Authorization: string, path: { config: string, bearer: string } }} */
function scriptsInputs(){
    //#region …
    const [ , name_candidate , ...argvs ]= process.argv;
    const script_name= name_candidate.slice(name_candidate.lastIndexOf("/")+1);
    const config_dir= 
        /* 
            OS X        - '/Users/user/Library/Preferences/asana_cli.json'
            Windows 8   - 'C:\Users\user\AppData\Roaming\asana_cli.json'
            Windows XP  - 'C:\Documents and Settings\user\Application Data\asana_cli.json'
            Linux       - '/home/user/.local/share/asana_cli.json'
        */
        (process.env.APPDATA || (process.env.HOME+(process.platform=='darwin'?'/Library/Preferences':"/.config"))) + "/asana_cli";
    if(!existsSync(config_dir))
        mkdirSync(config_dir, { recursive: true });
    const bearer= config_dir+"/bearer";
    let Authorization;
    try{
        Authorization= "Bearer "+readFileSync(bearer, { encoding: "utf8" }).split().reverse().join();
    } catch {
        if(argvs[0]!=="auth"&&argvs[0]!=="completion_bash"){
            console.error("Missign auth key, please use 'auth' option!");
            process.exit(1);
        }
    }
    const config_path= config_dir+"/asana_cli.json";
    const out= argvs=> ({ path: { config: config_path, bearer }, Authorization, argvs, script_name });
    if(!argvs[0] || "_"!==argvs[0][0])
        return out(argvs);
    const config= configRead(config_path);
    const alias= config.aliases[argvs[0]];
    if(alias)
        return out(alias.split(new RegExp(alias_join, "g")));
    console.error(`Unknown alias '${alias}'`);
    process.exit(1);
    //#endregion …
}
function pipe(...f){ return Array.prototype.reduce.bind(f, (acc, f)=> f(acc)); }
/**
 * @param {string} path
 * @param {object} def
 * @param {"max-age=15"|"max-age=1"|"no-cache"} [def.cache="max-age=1"]
 * @returns Promise<object>
 */
function get_(path, { cache= "max-age=1", qs= {} }= {}){ return new Promise(function(res,rej){
    // #region …
    const params= Object.entries(qs).map(kv => kv.map(encodeURIComponent).join("=")).join("&");
    if(params) path+= "?"+params;
    get("https://app.asana.com/api/1.0/"+path, { headers: { Authorization, "Cache-Control": cache } }, r=> {
        let body= "";
        r.on("data", chunk=> body+= chunk);
        r.on("end", ()=> {
            const { errors, data }= JSON.parse(body);
            if(data) return res(data);
            rej(errors);
        });
    })
    .on("error", rej); });
    // #endregion …
}
/**
 * @param {string} path
 * @param {object} def
 * @param {"max-age=15"|"max-age=1"|"no-cache"} [def.cache="max-age=1"]
 * @param {"PUT"|"POST"} [def.method="PUT"]
 * @returns Promise<object>
 */
function putPost_(path, { cache= "max-age=1", method= "PUT", qs= {} }= {}){ return new Promise(function(res,rej){
    // #region …
    const data= JSON.stringify(qs);
    const req= request({
        host: "app.asana.com",
        path: "/api/1.0/"+path,
        headers: {
            Authorization, "Cache-Control": cache,
            'Content-Length': data.length
        }, method }, r=> {
        let body= "";
        r.on("data", chunk=> body+= chunk);
        r.on("end", ()=> {
            const { errors, data }= JSON.parse(body);
            if(data) return res(data);
            rej(errors);
        });
    });
    req.on("error", rej);
    req.write(data);
    req.end();
    });
    // #endregion …
}
function createInterface(){
    //#region …
    const rl= readline.createInterface({ input: process.stdin, output: process.stdout, historySize: 30 });
    let to_exit= 1;
    rl.on("SIGINT", ()=> {
        if(!to_exit){
            rl.close();
            console.log("Exited with "+f("CTRL+C", "red")+"\n");
            return process.exit(0);
        }
        rl.write(null, { ctrl: true, name: "u" });
        console.log("Use "+f("CTRL+C", "red")+" again for exit");
        rl.write("\r\n");
        to_exit-= 1;
        rl.on("history", function once(){
            to_exit+= 1;
            rl.off("history", once);
        });
    });
    rl.on('SIGCONT', () => rl.prompt());
    return rl;
    //#endregion …
}
function question_(rl, q, a){ return new Promise(r=> { rl.question(q+": ", r); if(a) rl.write(a); }); }
async function questionChoose_(rl, options){
    //#region …
    const answers= await question_(rl, "choose from list");
    if(answers==="*") return options;
    return answers.split(" ").flatMap(function(v){
        if(v.indexOf("-")===-1) return [ Number(v) ];
        const [ start, end ]= v.split("-").map(n=> Number(n));
        return Array.from({ length: end-start+1 }).map((_, i)=> i+start);
    });
    //#endregion …
}
/**
 * @param {Interface} rl
 * @param {string[]} options
 * @returns Promise<string>
 */
async function questionCmd_(rl, options){
    //#region …
    const is_colors= isTTY && isTCS;
    let c= 75;
    console.log("\n*** Commands ***" + options.reduce(function(o, curr){
        c+= curr.length;
        if(is_colors) curr= curr.replace(/\[(\w)\]/g, "\x1b[34m$1\x1b[0m");
        if(c<76) return o+" ··· "+curr;
        c-= 75;
        return o+"\n  "+curr;
    }, ""));
    return await question_(rl, f("What now", "blue"));
    //#endregion …
}
/**
 * @param {string} text
 * @param {"blue"|"red"|"green"|"yellow"|"magenta"|"cyan"|"crimson"} color
 * @returns {string}
 */
function f(text, color){
    if(!isTTY || !isTCS) return text;
    const c= JSON.parse('{"red":"\\u001b[31m","green":"\\u001b[32m","yellow":"\\u001b[33m","blue":"\\u001b[34m","magenta":"\\u001b[35m","cyan":"\\u001b[36m","crimson":"\\u001b[38m"}');
    return c[color]+text+"\x1b[0m";
}
function spiner(){
    // #region …
    if(!isTTY) return ()=> {};
    const spin= (function(s){
        const { length }= s;
        let i= 0;
        return ()=> {
            console.log(`  ${s[i++%length]} loading data from api`);
            moveCursor(process.stdout, 0, -1);
        };
    })([ "⠁", "⠉", "⠙", "⠚", "⠒", "⠂",  "⠂", "⠒", "⠲", "⠴", "⠤", "⠄" ]);
    const i= setInterval(spin, 500);
    return ()=> {
        clearLine(process.stdout);
        clearInterval(i);
    };
    // #endregion …
}
function getOpen(){
    //#region …
    const { platform } = process;
    let opener;
    switch (platform) {
        case 'android':
        case 'linux': opener= ['xdg-open']; break;
        case 'darwin': opener= ['open']; break;
        case 'win32': opener= ['cmd', ['/c', 'start']]; break;
    }
    if(!opener) return ()=> console.error(`Unsupported platform '${platform}'`);
    return url=> new Promise((resolve, reject) => {
        try {
            const [command, args = []]= opener;
            execFileSync( command, [...args, encodeURI(url)]);
            return resolve();
        } catch (error) {
            return reject(error);
        }
    });
    //#endregion …
}
function helpMain(){
    //#region …
    const n= f(script_name, "magenta");
    const v= f(version, "yellow");
    return console.log(`
    ${n}@v${v}: Utility to manage some actions with Asana tasks from command line.
    
    USAGE
        ${n} ${f("list", "blue")} ${f("[subcommands]", "cyan")} [--help]
        ${n} ${f("marks", "blue")} ${f("[mark_name]", "cyan")} [--help]
        ${n} ${f("api …", "blue")} [--help]
        ${n} ${f("alias [add|remove|list] [alias_name] [alias_value]", "blue")} [--help]
        ${n} [--help|--version|--config-path]
        ${n} auth [--help]
        ${n} completion_bash [--help|--complete]
        ${n} abbreviate [custom_fields|tags|list|--help] [add|remove|list] [alias_name] [alias_value]
    
    LIST|MARKS = USAGE OVERALL
        Asana tasks/projects/… are all in one pile. That means, if you try lists
        all projects/tags/… it can easily ends up with too big lists.

        So, working with this cli is splitted into three phases:
        1. You choose (pin) your typical projects (section), tags and custom fields via:
            \`${n} ${f("list", "blue")} ${f("[tags|custom_fields|sections]", "cyan")} ${f("…", "red")}\`
        2. You choose (marked) tasks you want to work with (e. g. 'project1_urgent', 'project2_release2', …) via:
            \`${n} ${f("list", "blue")} ${f("[tasks-todos|tasks-favorites|tasks-all]", "cyan")} ${f("…", "red")}\`
        3. Finally, you manage your tasks via:
            \`${n} ${f("marks", "blue")} ${f("mark_name", "yellow")}\`
        …see help for each via: \`${n} ${f("list|marks", "blue")} --help\`
    
    API|ALIAS = SHORTEN LONG COMMAND / CUSTOM COMMANDS (WIP)
        You can create alias for ${f("any supported subcommands", "blue")}.
        With combination with ${f("api", "green")} you can requests all
        Asana GET API (see https://developers.asana.com/docs/) and
        cerate your own functionality.

        Supports for PUT/POST/DELETE may be in future. Also for 'alias' support
        for argument placeholder may be added.
    
    COMMANDS COMPLETITION IN BASH
        see \`${n} completion_bash --help\`
`);
    //#endregion …
}
// vim: set tabstop=4 shiftwidth=4 textwidth=250 expandtab :
// vim>60: set foldmethod=marker foldmarker=#region,#endregion :
